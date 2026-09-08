import { and, eq, lte, sql } from "drizzle-orm";
import type { createDatabase } from "./client";
import {
  subwayRequestBudgetScopes,
  subwayRequestReservations,
} from "./schema";

// Keep 100 calls/day out of the provider's documented 1,000-call ceiling.
// Arrivals get two thirds; position turns retain one third and are round-robin.
export const SUBWAY_REQUEST_BUDGET_TOTAL = 900;
export const SUBWAY_REQUEST_BUDGET_ARRIVALS = 600;
export const SUBWAY_REQUEST_BUDGET_POSITIONS = 300;
export const SUBWAY_REQUEST_WINDOW_MS = 24 * 60 * 60 * 1_000;
export const SUBWAY_ARRIVAL_MIN_INTERVAL_MS =
  SUBWAY_REQUEST_WINDOW_MS / SUBWAY_REQUEST_BUDGET_ARRIVALS;
export const SUBWAY_POSITION_MIN_INTERVAL_MS =
  SUBWAY_REQUEST_WINDOW_MS / SUBWAY_REQUEST_BUDGET_POSITIONS;
export const SUBWAY_QUOTA_COOLDOWN_MS = SUBWAY_REQUEST_WINDOW_MS;

export type SubwayRequestLane = "arrival" | "position";
export type SubwayBudgetDenialReason =
  | "cooldown"
  | "daily-limit"
  | "lane-limit"
  | "paced";

export interface SubwayBudgetDecision {
  readonly allowed: boolean;
  readonly retryAt: number | null;
  readonly reason?: SubwayBudgetDenialReason;
}

export interface SubwayPositionBudgetDecision extends SubwayBudgetDecision {
  readonly line?: string;
}

export interface SubwayRequestBudget {
  reserveArrival(scopeHash: string, now: number): Promise<SubwayBudgetDecision>;
  reservePosition(
    scopeHash: string,
    lines: readonly string[],
    now: number,
  ): Promise<SubwayPositionBudgetDecision>;
  markQuotaExhausted(scopeHash: string, now: number): Promise<void>;
}

type QuotaDatabase = ReturnType<typeof createDatabase>["database"];
type QuotaTransaction = Parameters<
  Parameters<QuotaDatabase["transaction"]>[0]
>[0];
type TransactionClock = () => number | Promise<number>;

type ReservationStats = {
  readonly count: number;
  readonly oldest: Date | null;
  readonly latest: Date | null;
};

/**
 * PostgreSQL-backed reservation ledger for the one Seoul subway key.
 *
 * Reservations are made before an upstream fetch, so an HTTP failure still
 * consumes one official request. The scope row is locked for the complete
 * check-and-insert transaction; this is what makes the rolling cap survive
 * concurrent API processes and restarts.
 */
export class DrizzleSubwayRequestBudget implements SubwayRequestBudget {
  constructor(
    private readonly database: QuotaDatabase,
    private readonly initialBlockedUntil?: number,
    private readonly transactionClock?: TransactionClock,
  ) {}

  reserveArrival(
    scopeHash: string,
    _callerNow: number,
  ): Promise<SubwayBudgetDecision> {
    return this.database.transaction((tx) =>
      this.reserveInTransaction(tx, scopeHash, "arrival", []),
    );
  }

  reservePosition(
    scopeHash: string,
    lines: readonly string[],
    _callerNow: number,
  ): Promise<SubwayPositionBudgetDecision> {
    if (lines.length === 0) {
      return Promise.resolve({
        allowed: false,
        retryAt: null,
        reason: "daily-limit",
      });
    }
    return this.database.transaction((tx) =>
      this.reserveInTransaction(tx, scopeHash, "position", lines),
    );
  }

  async markQuotaExhausted(
    scopeHash: string,
    _callerNow: number,
  ): Promise<void> {
    await this.database.transaction(async (tx) => {
      const { scope, now } = await lockScope(
        tx,
        scopeHash,
        this.initialBlockedUntil,
        () => this.readTransactionNow(tx),
      );
      const blockedUntil = now + SUBWAY_QUOTA_COOLDOWN_MS;
      if (
        scope.quotaBlockedUntil === null ||
        scope.quotaBlockedUntil.getTime() < blockedUntil
      ) {
        await tx
          .update(subwayRequestBudgetScopes)
          .set({ quotaBlockedUntil: new Date(blockedUntil) })
          .where(eq(subwayRequestBudgetScopes.scopeHash, scopeHash));
      }
    });
  }

  private async reserveInTransaction(
    tx: QuotaTransaction,
    scopeHash: string,
    lane: SubwayRequestLane,
    lines: readonly string[],
  ): Promise<SubwayBudgetDecision | SubwayPositionBudgetDecision> {
    const { scope, now } = await lockScope(
      tx,
      scopeHash,
      this.initialBlockedUntil,
      () => this.readTransactionNow(tx),
    );
    const cutoff = new Date(now - SUBWAY_REQUEST_WINDOW_MS);
    await tx
      .delete(subwayRequestReservations)
      .where(
        and(
          eq(subwayRequestReservations.scopeHash, scopeHash),
          lte(subwayRequestReservations.reservedAt, cutoff),
        ),
      );

    if (scope.quotaBlockedUntil && scope.quotaBlockedUntil.getTime() > now) {
      return denied("cooldown", scope.quotaBlockedUntil.getTime());
    }

    const total = await this.stats(tx, scopeHash);
    if (total.count >= SUBWAY_REQUEST_BUDGET_TOTAL) {
      return denied("daily-limit", afterOldest(total.oldest));
    }

    const laneStats = await this.stats(tx, scopeHash, lane);
    const laneLimit =
      lane === "arrival"
        ? SUBWAY_REQUEST_BUDGET_ARRIVALS
        : SUBWAY_REQUEST_BUDGET_POSITIONS;
    if (laneStats.count >= laneLimit) {
      return denied("lane-limit", afterOldest(laneStats.oldest));
    }

    const intervalMs =
      lane === "arrival"
        ? SUBWAY_ARRIVAL_MIN_INTERVAL_MS
        : SUBWAY_POSITION_MIN_INTERVAL_MS;
    const nextPacedAt = afterInterval(laneStats.latest, intervalMs);
    if (nextPacedAt !== null && nextPacedAt > now) {
      return denied("paced", nextPacedAt);
    }

    let line: string | undefined;
    if (lane === "position") {
      const cursor = positiveModulo(scope.positionCursor, lines.length);
      line = lines[cursor];
      if (line === undefined) {
        throw new Error("Subway position budget selected no line.");
      }
      await tx
        .update(subwayRequestBudgetScopes)
        .set({ positionCursor: (cursor + 1) % lines.length })
        .where(eq(subwayRequestBudgetScopes.scopeHash, scopeHash));
    }

    await tx.insert(subwayRequestReservations).values({
      scopeHash,
      lane,
      ...(line === undefined ? {} : { line }),
      reservedAt: new Date(now),
    });

    return line === undefined
      ? { allowed: true, retryAt: null }
      : { allowed: true, retryAt: null, line };
  }

  private async readTransactionNow(tx: QuotaTransaction) {
    const now = this.transactionClock
      ? await this.transactionClock()
      : await readDatabaseNow(tx);
    if (!Number.isFinite(now)) {
      throw new Error("Subway request budget returned an invalid clock time.");
    }
    return now;
  }

  private async stats(
    tx: QuotaTransaction,
    scopeHash: string,
    lane?: SubwayRequestLane,
  ): Promise<ReservationStats> {
    const conditions = [eq(subwayRequestReservations.scopeHash, scopeHash)];
    if (lane !== undefined) {
      conditions.push(eq(subwayRequestReservations.lane, lane));
    }
    const [row] = await tx
      .select({
        count: sql<number>`count(*)::int`,
        oldest: sql<Date | string | null>`min(${subwayRequestReservations.reservedAt})`,
        latest: sql<Date | string | null>`max(${subwayRequestReservations.reservedAt})`,
      })
      .from(subwayRequestReservations)
      .where(and(...conditions));
    return {
      count: Number(row?.count ?? 0),
      oldest: toDate(row?.oldest),
      latest: toDate(row?.latest),
    };
  }
}

async function lockScope(
  tx: QuotaTransaction,
  scopeHash: string,
  initialBlockedUntil: number | undefined,
  readNow: () => Promise<number>,
) {
  await tx
    .insert(subwayRequestBudgetScopes)
    .values({ scopeHash })
    .onConflictDoNothing();
  await tx.execute(
    sql`SELECT ${subwayRequestBudgetScopes.scopeHash}
        FROM ${subwayRequestBudgetScopes}
        WHERE ${subwayRequestBudgetScopes.scopeHash} = ${scopeHash}
        FOR UPDATE`,
  );
  const now = await readNow();
  const [scope] = await tx
    .select()
    .from(subwayRequestBudgetScopes)
    .where(eq(subwayRequestBudgetScopes.scopeHash, scopeHash));
  if (!scope) {
    throw new Error("Subway request budget scope was not created.");
  }
  const initialCooldown =
    initialBlockedUntil !== undefined && initialBlockedUntil > now
      ? new Date(initialBlockedUntil)
      : undefined;
  if (
    initialCooldown !== undefined &&
    (scope.quotaBlockedUntil === null ||
      scope.quotaBlockedUntil.getTime() < initialCooldown.getTime())
  ) {
    await tx
      .update(subwayRequestBudgetScopes)
      .set({ quotaBlockedUntil: initialCooldown })
      .where(eq(subwayRequestBudgetScopes.scopeHash, scopeHash));
    return {
      scope: { ...scope, quotaBlockedUntil: initialCooldown },
      now,
    };
  }
  return { scope, now };
}

async function readDatabaseNow(tx: QuotaTransaction) {
  const [row] = await tx.execute(
    sql`SELECT extract(epoch FROM clock_timestamp()) * 1000 AS epoch_ms`,
  );
  const epochMs = (row as { epoch_ms?: number | string } | undefined)?.epoch_ms;
  const now = Number(epochMs);
  if (!Number.isFinite(now)) {
    throw new Error("Subway request budget returned an invalid database time.");
  }
  return now;
}

function denied(
  reason: SubwayBudgetDenialReason,
  retryAt: number | null,
): SubwayBudgetDecision {
  return { allowed: false, retryAt, reason };
}

function toDate(value: Date | string | null | undefined) {
  if (value === null || value === undefined) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error("Subway request budget returned an invalid timestamp.");
  }
  return date;
}

function afterOldest(oldest: Date | null) {
  return oldest === null ? null : oldest.getTime() + SUBWAY_REQUEST_WINDOW_MS;
}

function afterInterval(latest: Date | null, intervalMs: number) {
  return latest === null ? null : latest.getTime() + intervalMs;
}

function positiveModulo(value: number, divisor: number) {
  return ((value % divisor) + divisor) % divisor;
}
