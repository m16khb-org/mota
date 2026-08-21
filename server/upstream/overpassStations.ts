import {
  type SubwayStation,
  normalizeNearbySubwayStations,
} from "../../src/domain/subway";
import { UPSTREAM_HEADERS } from "./seoulBus";
import { UpstreamError } from "./upstreamError";

const OVERPASS_ENDPOINTS = [
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://overpass-api.de/api/interpreter",
] as const;
const SUBWAY_TOTAL_BUDGET_MS = 16_000;
const SUBWAY_MIRROR_STAGGER_MS = 1_500;
const SUBWAY_CACHE_TTL_MS = 24 * 60 * 60 * 1_000;
const SUBWAY_MIRROR_COOLDOWN_MS = 60 * 1_000;

interface SubwayCacheEntry {
  readonly stations: SubwayStation[];
  readonly savedAt: number;
}

export interface OverpassDeps {
  readonly now?: (() => number) | undefined;
  readonly sleep?: ((ms: number) => Promise<void>) | undefined;
}

type UpstreamFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

/** Overpass driven adapter with a 24h result cache, per-mirror failure
 * cooldown, staggered mirror race inside a 16s budget, and stale-cache
 * fallback when every mirror fails. */
export function createOverpassStations(
  upstreamFetch: UpstreamFetch,
  deps: OverpassDeps = {},
) {
  const now = deps.now ?? Date.now;
  const sleep =
    deps.sleep ??
    ((ms: number) =>
      new Promise<void>((resolve) => {
        setTimeout(resolve, ms);
      }));
  const cache = new Map<string, SubwayCacheEntry>();
  const mirrorFailedAt = new Map<string, number>();

  return {
    /** Fresh stations, a cached copy, or a stale-cache fallback. Throws
     * `UpstreamError` only when nothing is available. */
    async fetchNearbyStations(
      location: { readonly lat: number; readonly lng: number; readonly radius: number },
    ): Promise<SubwayStation[]> {
      const { lat, lng, radius } = location;
      const cacheKey = `${lat.toFixed(3)}:${lng.toFixed(3)}:${radius}`;
      const cached = cache.get(cacheKey);
      if (cached && now() - cached.savedAt < SUBWAY_CACHE_TTL_MS) {
        return cached.stations;
      }

      const overpassQuery = [
        "[out:json][timeout:12];",
        `nwr["railway"="station"]["station"="subway"](around:${radius},${lat},${lng});`,
        "out center tags;",
      ].join("");

      const availableMirrors = OVERPASS_ENDPOINTS.filter(
        (endpoint) =>
          now() -
            (mirrorFailedAt.get(endpoint) ?? Number.NEGATIVE_INFINITY) >=
          SUBWAY_MIRROR_COOLDOWN_MS,
      );
      const mirrors =
        availableMirrors.length > 0 ? availableMirrors : [...OVERPASS_ENDPOINTS];
      const deadline = now() + SUBWAY_TOTAL_BUDGET_MS;

      let winnerFound = false;
      const running = new Set<AbortController>();
      const attempts = mirrors.map(async (endpoint, index) => {
        if (index > 0) {
          await sleep(SUBWAY_MIRROR_STAGGER_MS * index);
          if (winnerFound) {
            throw new UpstreamError(
              "Subway stations upstream skipped",
              `Skipped ${endpoint} after another mirror won`,
            );
          }
        }
        const remainingBudget = deadline - now();
        if (remainingBudget <= 0) {
          throw new UpstreamError(
            "Subway stations upstream failed",
            `Subway mirror budget exhausted before ${endpoint}`,
          );
        }
        const controller = new AbortController();
        const abortTimer = setTimeout(
          () => controller.abort(),
          remainingBudget,
        );
        running.add(controller);
        try {
          const response = await upstreamFetch(endpoint, {
            method: "POST",
            headers: {
              ...UPSTREAM_HEADERS,
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({ data: overpassQuery }),
            signal: controller.signal,
          });
          if (!response.ok) {
            throw new UpstreamError(
              "Subway stations upstream failed",
              `Subway stations upstream returned ${response.status}`,
            );
          }
          const stations = normalizeNearbySubwayStations(
            await response.json(),
            location,
          );
          mirrorFailedAt.delete(endpoint);
          return stations;
        } catch (error) {
          if (!winnerFound) {
            mirrorFailedAt.set(endpoint, now());
          }
          throw error;
        } finally {
          clearTimeout(abortTimer);
          running.delete(controller);
        }
      });

      try {
        const stations = await Promise.any(attempts);
        winnerFound = true;
        for (const controller of running) {
          controller.abort();
        }
        cache.set(cacheKey, { stations, savedAt: now() });
        return stations;
      } catch (error) {
        if (cached) {
          return cached.stations;
        }
        const failure =
          error instanceof AggregateError
            ? (error.errors.find((inner) => inner instanceof Error) ?? error)
            : error;
        throw new UpstreamError(
          "Subway stations upstream failed",
          failure instanceof Error ? failure.message : "Unknown upstream failure",
        );
      }
    },
  };
}
