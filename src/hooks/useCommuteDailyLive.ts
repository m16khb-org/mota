import { useMemo } from "react";
import type { BusArrival, BusStop } from "../domain/bus";
import type {
  CommuteFavorite,
  SavedCommuteProcedure,
} from "../domain/commute";
import {
  estimateCommuteProcedure,
  type BusArrivalsSource,
  type CommuteEstimate,
  type SubwayArrivalsSource,
} from "../domain/commuteEstimate";
import { deriveLiveQueries, type BusLiveQuery, type LiveQuery, type LiveSnapshot, type SubwayLiveQuery } from "../domain/liveCommuteQueries";
import type { SubwayArrival, SubwayStation } from "../domain/subway";
import { useLiveCommuteSnapshots } from "./useLiveCommuteSnapshots";

export function isBusArrivalRow(
  arrival: BusArrival | SubwayArrival,
): arrival is BusArrival {
  return "routeId" in arrival;
}

export function isSubwayArrivalRow(
  arrival: BusArrival | SubwayArrival,
): arrival is SubwayArrival {
  return "subwayId" in arrival;
}

interface EstimateSources {
  readonly busArrivals: readonly BusArrivalsSource[];
  readonly subwayArrivals: readonly SubwayArrivalsSource[];
}

/** Adapt Task 5/6 snapshots into Task 4 estimator sources. One bus endpoint
 * snapshot fans out to every saved stop it serves; freshness rules stay owned
 * by the estimator. */
function estimateSources(
  snapshots: ReadonlyMap<string, LiveSnapshot>,
): EstimateSources {
  const busArrivals: BusArrivalsSource[] = [];
  const subwayArrivals: SubwayArrivalsSource[] = [];
  for (const snapshot of snapshots.values()) {
    const rows = snapshot.lastSuccess?.arrivals ?? null;
    const successAt = snapshot.lastSuccess?.updatedAt ?? null;
    const latestAttemptFailed = snapshot.latestAttemptStatus === "failure";
    if (snapshot.query.kind === "bus") {
      const arrivals =
        rows === null ? null : rows.filter(isBusArrivalRow);
      for (const stopId of snapshot.query.stopIds) {
        busArrivals.push({ stopId, arrivals, successAt, latestAttemptFailed });
      }
    } else {
      const arrivals =
        rows === null ? null : rows.filter(isSubwayArrivalRow);
      for (const stationId of snapshot.query.stationIds) {
        subwayArrivals.push({
          stationId,
          arrivals,
          successAt,
          latestAttemptFailed,
        });
      }
    }
  }
  return { busArrivals, subwayArrivals };
}

export interface UseCommuteDailyLiveResult {
  readonly queries: readonly LiveQuery[];
  readonly snapshots: ReadonlyMap<string, LiveSnapshot>;
  readonly estimate: CommuteEstimate | null;
  readonly refreshing: boolean;
  readonly refresh: () => void;
  readonly now: number;
}

/** Shared query covering this stop's endpoint, or null when the detail panel
 * must fetch on its own (point outside the live query set). Query-set
 * coverage is known synchronously, so it also covers the first paint before
 * the shared controller commits its pending snapshot. */
export function busDetailQuery(
  queries: readonly LiveQuery[],
  stop: BusStop | null,
): BusLiveQuery | null {
  if (stop === null) return null;
  const query = queries.find(
    (candidate): candidate is BusLiveQuery =>
      candidate.kind === "bus" &&
      candidate.args.arsId === stop.arsId &&
      candidate.stopIds.includes(stop.id),
  );
  return query ?? null;
}

/** Shared query covering this station's fetch endpoint, or null when the
 * detail panel must fetch on its own. */
export function subwayDetailQuery(
  queries: readonly LiveQuery[],
  station: SubwayStation | null,
): SubwayLiveQuery | null {
  if (station === null) return null;
  const query = queries.find(
    (candidate): candidate is SubwayLiveQuery =>
      candidate.kind === "subway" &&
      candidate.args.station === station.name &&
      candidate.stationIds.includes(station.id),
  );
  return query ?? null;
}

/** Single daily-flow wiring: derive the active live query set from the active
 * procedure plus visible favorites, run the one foreground refresh
 * controller, and feed its snapshots to the pure estimator. */
export function useCommuteDailyLive(
  activeProcedure: SavedCommuteProcedure | null,
  favorites: readonly CommuteFavorite[],
): UseCommuteDailyLiveResult {
  const queries = useMemo(
    () => deriveLiveQueries({ activeProcedure, visibleFavorites: favorites }),
    [activeProcedure, favorites],
  );
  const { snapshots, refresh } = useLiveCommuteSnapshots(queries);
  const sources = useMemo(() => estimateSources(snapshots), [snapshots]);
  const { estimate, now } = useMemo(() => {
    const current = Date.now();
    return {
      now: current,
      estimate:
        activeProcedure?.kind === "ready"
          ? estimateCommuteProcedure({
              procedure: activeProcedure,
              now: current,
              ...sources,
            })
          : null,
    };
  }, [activeProcedure, sources]);
  const refreshing = useMemo(
    () =>
      [...snapshots.values()].some(
        (snapshot) => snapshot.latestAttemptStatus === "pending",
      ),
    [snapshots],
  );
  return {
    queries,
    snapshots,
    estimate,
    refreshing,
    refresh,
    now,
  } as const;
}
