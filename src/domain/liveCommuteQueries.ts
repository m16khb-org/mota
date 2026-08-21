import type { ArsId, BusArrival, StopId } from "./bus";
import type {
  CommuteFavorite,
  SavedCommuteProcedure,
} from "./commute";
import type { SubwayArrival, SubwayStation } from "./subway";

/** A successful snapshot is live for at most 90 seconds. Anything older, or
 * any newer failed attempt, is stale; no successful snapshot is unavailable. */
export const LIVE_FRESHNESS_MS = 90_000;

export interface BusLiveQuery {
  readonly kind: "bus";
  /** Endpoint dedupe key: `bus:${arsId}`. */
  readonly key: string;
  readonly args: { readonly arsId: ArsId };
  /** Every consuming saved bus stop ID, deduped, in first-appearance order. */
  readonly stopIds: readonly StopId[];
}

export interface SubwayLiveQuery {
  readonly kind: "subway";
  /** Endpoint dedupe key: `subway:${apiStationName}` (the fetch endpoint). */
  readonly key: string;
  readonly args: { readonly station: string };
  /** Every consuming saved station ID, deduped, in first-appearance order;
   * downstream matching stays point-scoped even when one API station name
   * serves several saved stations. */
  readonly stationIds: readonly SubwayStation["id"][];
}

export type LiveQuery = BusLiveQuery | SubwayLiveQuery;

export type LiveAttemptStatus = "idle" | "pending" | "success" | "failure";

export type LiveArrivals = BusArrival | SubwayArrival;

export interface LiveSnapshot<T = LiveArrivals> {
  readonly query: LiveQuery;
  readonly latestAttemptAt: number;
  readonly latestAttemptStatus: LiveAttemptStatus;
  readonly lastSuccess: {
    readonly updatedAt: number;
    readonly arrivals: readonly T[];
  } | null;
  readonly error: string | null;
}

export type LiveBasis = "live" | "stale" | "unavailable";

export interface LiveQueryInput {
  /** Only the active ready procedure contributes; `null` (inactive)
   * derives no request. */
  readonly activeProcedure: SavedCommuteProcedure | null;
  readonly visibleFavorites: readonly CommuteFavorite[];
}

/** Driven port: fetches one query endpoint's arrivals. The domain names the
 * abstraction; the concrete transport lives in `src/api/client.ts` and is
 * injected by the refresh controller / tests. */
export type LiveArrivalsPort = (
  query: LiveQuery,
) => Promise<{
  readonly updatedAt: number;
  readonly arrivals: readonly LiveArrivals[];
}>;

export function deriveLiveQueries(input: LiveQueryInput): readonly LiveQuery[] {
  const queries: LiveQuery[] = [];
  const stopIdsByBusKey = new Map<string, StopId[]>();
  const stationIdsBySubwayKey = new Map<string, SubwayStation["id"][]>();

  const addBusQuery = (stopId: StopId, arsId: ArsId): void => {
    const key = `bus:${arsId}`;
    let stopIds = stopIdsByBusKey.get(key);
    if (stopIds === undefined) {
      stopIds = [];
      stopIdsByBusKey.set(key, stopIds);
      queries.push({ kind: "bus", key, args: { arsId }, stopIds });
    }
    if (!stopIds.includes(stopId)) {
      stopIds.push(stopId);
    }
  };

  const addSubwayQuery = (
    stationId: SubwayStation["id"],
    apiStationName: string,
  ): void => {
    const key = `subway:${apiStationName}`;
    let stationIds = stationIdsBySubwayKey.get(key);
    if (stationIds === undefined) {
      stationIds = [];
      stationIdsBySubwayKey.set(key, stationIds);
      queries.push({
        kind: "subway",
        key,
        args: { station: apiStationName },
        stationIds,
      });
    }
    if (!stationIds.includes(stationId)) {
      stationIds.push(stationId);
    }
  };

  const procedure = input.activeProcedure;
  if (procedure?.kind === "ready") {
    for (const step of procedure.steps) {
      if (step.kind === "bus") {
        addBusQuery(step.stopId, step.arsId);
      } else if (step.kind === "subway") {
        addSubwayQuery(step.stationId, step.apiStationName);
      }
    }
  }

  for (const favorite of input.visibleFavorites) {
    if (favorite.kind === "bus") {
      addBusQuery(favorite.stopId, favorite.arsId);
    } else {
      addSubwayQuery(favorite.stationId, favorite.apiStationName);
    }
  }

  return queries;
}

export function snapshotBasis(
  snapshot: LiveSnapshot<unknown>,
  now: number,
): LiveBasis {
  if (snapshot.lastSuccess === null) {
    return "unavailable";
  }
  if (snapshot.latestAttemptStatus === "failure") {
    return "stale";
  }
  if (now - snapshot.lastSuccess.updatedAt > LIVE_FRESHNESS_MS) {
    return "stale";
  }
  return "live";
}

async function fetchLiveQuery(
  port: LiveArrivalsPort,
  query: LiveQuery,
): Promise<{
  readonly updatedAt: number;
  readonly arrivals: readonly LiveArrivals[];
}> {
  return port(query);
}

export interface RefreshLiveQueriesOptions {
  /** Transport port; implemented by `liveArrivalsPort` in `src/api/client.ts`. */
  readonly port: LiveArrivalsPort;
  /** Snapshots from the previous cycle; a failing endpoint keeps its retained
   * last success instead of erasing it. */
  readonly previous?: ReadonlyMap<string, LiveSnapshot>;
  /** Epoch-ms attempt timestamp; defaults to `Date.now()`. */
  readonly now?: number;
}

/** Fetches every query endpoint once through `src/api/client.ts` and returns
 * the terminal attempt state per query key. The caller (refresh controller)
 * owns marking snapshots pending and dropping obsolete keys. */
export async function refreshLiveQueries(
  queries: readonly LiveQuery[],
  options: RefreshLiveQueriesOptions,
): Promise<ReadonlyMap<string, LiveSnapshot>> {
  const previous = options.previous ?? new Map<string, LiveSnapshot>();
  const now = options.now ?? Date.now();

  const snapshots = await Promise.all(
    queries.map(async (query): Promise<LiveSnapshot> => {
      try {
        const result = await fetchLiveQuery(options.port, query);
        return {
          query,
          latestAttemptAt: now,
          latestAttemptStatus: "success",
          lastSuccess: result,
          error: null,
        };
      } catch (error) {
        return {
          query,
          latestAttemptAt: now,
          latestAttemptStatus: "failure",
          lastSuccess: previous.get(query.key)?.lastSuccess ?? null,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }),
  );

  return new Map(snapshots.map((snapshot) => [snapshot.query.key, snapshot]));
}
