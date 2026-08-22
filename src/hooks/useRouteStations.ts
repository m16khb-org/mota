import { useEffect, useMemo, useRef, useState } from "react";
import { fetchRouteStations } from "../api/client";
import type { BusRouteStation } from "../domain/bus";
import { isBusArrivalRow } from "./useCommuteDailyLive";
import type { ResolvedAutoPoint } from "../domain/autoCommuteEstimate";
import type { LiveSnapshot } from "../domain/liveCommuteQueries";

/** How many soonest-departing routes per boarding stop get verified against
 * their route stop lists; the rest keep the geometry fallback. */
const MAX_ROUTES_PER_STOP = 8;

type RouteStations = ReadonlyMap<string, readonly BusRouteStation[]>;

/** Collects the route ids worth verifying from live bus snapshots at the
 * itinerary's boarding stops (soonest departures first). */
function neededRouteIds(
  points: readonly ResolvedAutoPoint[],
  snapshots: ReadonlyMap<string, LiveSnapshot>,
): string[] {
  const ids = new Set<string>();
  for (const point of points) {
    if (point.kind !== "stop" || point.arsId === undefined) {
      continue;
    }
    const snapshot = snapshots.get(`bus:${point.arsId}`);
    if (snapshot === undefined || snapshot.lastSuccess === null) {
      continue;
    }
    const arrivals = snapshot.lastSuccess.arrivals.filter(isBusArrivalRow);
    arrivals.sort(
      (left, right) =>
        (left.first.seconds ?? Number.POSITIVE_INFINITY) -
        (right.first.seconds ?? Number.POSITIVE_INFINITY),
    );
    for (const arrival of arrivals.slice(0, MAX_ROUTES_PER_STOP)) {
      ids.add(arrival.routeId);
    }
  }
  return [...ids].sort();
}

/** Lazily fetches route stop lists for the itinerary's candidate bus routes
 * and caches them for the session (the server caches upstream for 24h).
 * Failed lookups are cached as empty lists so one dead route id cannot
 * retrigger requests on every refresh cycle. */
export function useRouteStations(
  points: readonly ResolvedAutoPoint[],
  snapshots: ReadonlyMap<string, LiveSnapshot>,
): RouteStations {
  const cacheRef = useRef<Map<string, readonly BusRouteStation[]>>(new Map());
  const [snapshot, setSnapshot] = useState<RouteStations>(() => new Map());
  const needed = useMemo(
    () => neededRouteIds(points, snapshots),
    [points, snapshots],
  );

  useEffect(() => {
    let cancelled = false;
    const missing = needed.filter((routeId) => !cacheRef.current.has(routeId));
    if (missing.length === 0) {
      return;
    }
    void Promise.all(
      missing.map(async (routeId) => {
        try {
          const stations = await fetchRouteStations(routeId);
          cacheRef.current.set(routeId, stations);
        } catch {
          cacheRef.current.set(routeId, []);
        }
      }),
    ).then(() => {
      if (!cancelled) {
        setSnapshot(new Map(cacheRef.current));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [needed]);

  return snapshot;
}
