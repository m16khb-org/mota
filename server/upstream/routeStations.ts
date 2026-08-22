import type { BusRouteStation } from "../../src/domain/bus";
import { fetchRouteStations } from "./seoulBus";

type UpstreamFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

interface CacheEntry {
  readonly expiresAt: number;
  readonly stations: readonly BusRouteStation[];
}

/** Route paths change rarely; a day-long cache keeps waypoint verification
 * off the hot path. Failures are not cached — the next request retries. */
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_CACHE_ENTRIES = 256;

export interface RouteStationsCache {
  readonly fetch: (
    busRouteId: string,
  ) => Promise<readonly BusRouteStation[]>;
}

export function createRouteStations(
  upstreamFetch: UpstreamFetch,
  deps: { readonly now?: (() => number) | undefined } = {},
): RouteStationsCache {
  const now = deps.now ?? Date.now;
  const cache = new Map<string, CacheEntry>();

  const fetch = async (busRouteId: string): Promise<readonly BusRouteStation[]> => {
    const cached = cache.get(busRouteId);
    if (cached !== undefined && cached.expiresAt > now()) {
      return cached.stations;
    }
    const stations = await fetchRouteStations(upstreamFetch, busRouteId);
    if (cache.size >= MAX_CACHE_ENTRIES) {
      const oldest = cache.keys().next();
      if (oldest.done !== true) {
        cache.delete(oldest.value);
      }
    }
    cache.set(busRouteId, { expiresAt: now() + CACHE_TTL_MS, stations });
    return stations;
  };

  return { fetch };
}
