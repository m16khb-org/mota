import { eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { createDatabase } from "./client";
import {
  DrizzleSubwayRequestBudget,
  SUBWAY_ARRIVAL_MIN_INTERVAL_MS,
  SUBWAY_POSITION_MIN_INTERVAL_MS,
  SUBWAY_QUOTA_COOLDOWN_MS,
  SUBWAY_REQUEST_WINDOW_MS,
} from "./quota";
import {
  subwayRequestBudgetScopes,
  subwayRequestReservations,
} from "./schema";

const databaseUrl = process.env.DATABASE_URL;
const integration = describe.runIf(Boolean(databaseUrl));

integration("DrizzleSubwayRequestBudget", () => {
  const { client, database } = createDatabase(databaseUrl ?? "");
  const scopes: string[] = [];

  afterAll(async () => {
    for (const scopeHash of scopes) {
      await database
        .delete(subwayRequestReservations)
        .where(eq(subwayRequestReservations.scopeHash, scopeHash));
      await database
        .delete(subwayRequestBudgetScopes)
        .where(eq(subwayRequestBudgetScopes.scopeHash, scopeHash));
    }
    await client.end();
  });

  function scope() {
    const value = crypto.randomUUID().replaceAll("-", "").padEnd(64, "0");
    scopes.push(value);
    return value;
  }

  it("uses the controlled transaction clock instead of a caller wall clock", async () => {
    const scopeHash = scope();
    const base = Date.parse("2026-09-08T12:00:00.000Z");
    const clock = { value: base };
    const budget = new DrizzleSubwayRequestBudget(
      database,
      undefined,
      () => clock.value,
    );

    await expect(budget.reserveArrival(scopeHash, base)).resolves.toMatchObject({
      allowed: true,
    });
    clock.value = base + SUBWAY_ARRIVAL_MIN_INTERVAL_MS - 1;
    await expect(
      budget.reserveArrival(
        scopeHash,
        base + SUBWAY_ARRIVAL_MIN_INTERVAL_MS + 1,
      ),
    ).resolves.toMatchObject({ allowed: false, reason: "paced" });
  });

  it("uses PostgreSQL time when no test clock seam is supplied", async () => {
    const scopeHash = scope();
    const beforeRows = await database.execute(
      sql`SELECT extract(epoch FROM clock_timestamp()) * 1000 AS epoch_ms`,
    );
    const before = Number(
      (beforeRows[0] as { epoch_ms?: number | string } | undefined)?.epoch_ms,
    );
    const budget = new DrizzleSubwayRequestBudget(database);

    await expect(budget.reserveArrival(scopeHash, 0)).resolves.toMatchObject({
      allowed: true,
    });
    const [reservation] = await database
      .select({ reservedAt: subwayRequestReservations.reservedAt })
      .from(subwayRequestReservations)
      .where(eq(subwayRequestReservations.scopeHash, scopeHash));
    const afterRows = await database.execute(
      sql`SELECT extract(epoch FROM clock_timestamp()) * 1000 AS epoch_ms`,
    );
    const after = Number(
      (afterRows[0] as { epoch_ms?: number | string } | undefined)?.epoch_ms,
    );

    expect(reservation?.reservedAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(reservation?.reservedAt.getTime()).toBeLessThanOrEqual(after);
  });

  it("serializes concurrent clients and preserves the reservation after restart", async () => {
    const scopeHash = scope();
    const now = Date.parse("2026-09-08T12:00:00.000Z");
    const clock = { value: now };
    const clients = Array.from(
      { length: 32 },
      () =>
        new DrizzleSubwayRequestBudget(
          database,
          undefined,
          () => clock.value,
        ),
    );

    const decisions = await Promise.all(
      clients.map((budget) => budget.reserveArrival(scopeHash, now)),
    );

    expect(decisions.filter((decision) => decision.allowed)).toHaveLength(1);
    expect(
      decisions
        .filter((decision) => !decision.allowed)
        .every((decision) => decision.reason === "paced"),
    ).toBe(true);

    const restarted = new DrizzleSubwayRequestBudget(
      database,
      undefined,
      () => clock.value,
    );
    clock.value = now + SUBWAY_ARRIVAL_MIN_INTERVAL_MS - 1;
    await expect(
      restarted.reserveArrival(scopeHash, clock.value),
    ).resolves.toMatchObject({ allowed: false, reason: "paced" });
    clock.value = now + SUBWAY_REQUEST_WINDOW_MS;
    await expect(
      restarted.reserveArrival(scopeHash, clock.value),
    ).resolves.toMatchObject({ allowed: true });
  });

  it("rejects a full shared rolling budget before either lane can exceed 900", async () => {
    const scopeHash = scope();
    const now = Date.parse("2026-09-08T12:00:00.000Z");
    const clock = { value: now };
    await database.insert(subwayRequestBudgetScopes).values({
      scopeHash,
      createdAt: new Date(now),
    });
    const reservedAt = new Date(now - 60_000).toISOString();
    await database.execute(sql`
      INSERT INTO "subway_request_reservations"
        ("scope_hash", "lane", "reserved_at")
      SELECT ${scopeHash},
        CASE WHEN series.i <= 450 THEN 'arrival' ELSE 'position' END,
        ${reservedAt}::timestamptz
      FROM generate_series(1, 900) AS series(i)
    `);

    const budget = new DrizzleSubwayRequestBudget(
      database,
      undefined,
      () => clock.value,
    );
    await expect(
      budget.reserveArrival(scopeHash, clock.value),
    ).resolves.toMatchObject({ allowed: false, reason: "daily-limit" });
    await expect(
      budget.reservePosition(scopeHash, ["1호선"], clock.value),
    ).resolves.toMatchObject({ allowed: false, reason: "daily-limit" });
  });

  it("keeps position turns fair across a process restart and persists quota cooldown", async () => {
    const scopeHash = scope();
    const lines = ["1호선", "2호선", "3호선"];
    const now = Date.parse("2026-09-08T12:00:00.000Z");
    const clock = { value: now };
    const firstProcess = new DrizzleSubwayRequestBudget(
      database,
      undefined,
      () => clock.value,
    );
    const secondProcess = new DrizzleSubwayRequestBudget(
      database,
      undefined,
      () => clock.value,
    );

    await expect(
      firstProcess.reservePosition(scopeHash, lines, clock.value),
    ).resolves.toMatchObject({ allowed: true, line: "1호선" });
    clock.value = now + SUBWAY_POSITION_MIN_INTERVAL_MS;
    await expect(
      firstProcess.reservePosition(scopeHash, lines, clock.value),
    ).resolves.toMatchObject({ allowed: true, line: "2호선" });
    clock.value = now + SUBWAY_POSITION_MIN_INTERVAL_MS * 2;
    await expect(
      secondProcess.reservePosition(scopeHash, lines, clock.value),
    ).resolves.toMatchObject({ allowed: true, line: "3호선" });

    await secondProcess.markQuotaExhausted(scopeHash, clock.value);
    clock.value = now + SUBWAY_POSITION_MIN_INTERVAL_MS * 3;
    await expect(
      firstProcess.reservePosition(scopeHash, lines, clock.value),
    ).resolves.toMatchObject({
      allowed: false,
      reason: "cooldown",
      retryAt:
        now + SUBWAY_POSITION_MIN_INTERVAL_MS * 2 + SUBWAY_QUOTA_COOLDOWN_MS,
    });

    const bootstrapScope = scope();
    const bootstrapUntil = now + SUBWAY_QUOTA_COOLDOWN_MS;
    const bootstrapClock = { value: now };
    const bootstrapped = new DrizzleSubwayRequestBudget(
      database,
      bootstrapUntil,
      () => bootstrapClock.value,
    );
    await expect(
      bootstrapped.reserveArrival(bootstrapScope, bootstrapClock.value),
    ).resolves.toMatchObject({
      allowed: false,
      reason: "cooldown",
      retryAt: bootstrapUntil,
    });
    await expect(
      new DrizzleSubwayRequestBudget(
        database,
        undefined,
        () => bootstrapClock.value,
      ).reserveArrival(bootstrapScope, bootstrapClock.value),
    ).resolves.toMatchObject({ allowed: false, reason: "cooldown" });
  });
});
