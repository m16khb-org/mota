import { Hono } from "hono";
import {
  arrivalLookupSchema,
  nearbySearchSchema,
  normalizeArrivals,
  normalizeNearbyStops,
} from "../src/domain/bus";
import {
  type SubwayStation,
  normalizeNearbySubwayStations,
  subwaySearchSchema,
} from "../src/domain/subway";

type UpstreamFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

const NEARBY_STOPS_URL = "https://bus.go.kr/sbus/bus/selectNearStops.do";
const ARRIVALS_URL = "http://m.bus.go.kr/mBus/bus/getStationByUid.bms";
const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
] as const;
const SUBWAY_ATTEMPT_TIMEOUT_MS = 6_500;
const SUBWAY_TOTAL_BUDGET_MS = 7_000;
const SUBWAY_CACHE_TTL_MS = 24 * 60 * 60 * 1_000;
const SUBWAY_MIRROR_COOLDOWN_MS = 60 * 1_000;

const UPSTREAM_HEADERS = {
  Accept: "application/json",
  "User-Agent": "mota/0.1 (+https://bus.m16khb.xyz)",
} as const;

interface SubwayCacheEntry {
  readonly stations: SubwayStation[];
  readonly savedAt: number;
}

interface AppDeps {
  readonly now?: () => number;
}

export function createApp(
  upstreamFetch: UpstreamFetch = globalThis.fetch,
  deps: AppDeps = {},
) {
  const now = deps.now ?? Date.now;
  const subwayCache = new Map<string, SubwayCacheEntry>();
  const subwayMirrorFailedAt = new Map<string, number>();
  const app = new Hono();

  app.get("/api/health", (context) =>
    context.json({ status: "ok", service: "mota" }),
  );

  app.get("/api/stops/nearby", async (context) => {
    const query = nearbySearchSchema.safeParse(context.req.query());
    if (!query.success) {
      return context.json(
        {
          error: "INVALID_LOCATION",
          message: "서울 서비스 범위의 위도, 경도, 반경을 입력해 주세요.",
        },
        400,
      );
    }

    const upstreamUrl = new URL(NEARBY_STOPS_URL);
    upstreamUrl.search = new URLSearchParams({
      kiloMeter: String(query.data.radius / 1000),
      lati: String(query.data.lat),
      longi: String(query.data.lng),
    }).toString();

    try {
      const response = await upstreamFetch(upstreamUrl.toString(), {
        headers: UPSTREAM_HEADERS,
        signal: AbortSignal.timeout(8_000),
      });
      if (!response.ok) {
        throw new Error(`Nearby stops upstream returned ${response.status}`);
      }

      const stops = normalizeNearbyStops(await response.json());
      return context.json({ stops });
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Unknown upstream failure";
      return context.json(
        {
          error: "UPSTREAM_UNAVAILABLE",
          message: "정류장 정보를 불러오지 못했습니다.",
          detail,
        },
        502,
      );
    }
  });

  app.get("/api/subway/nearby", async (context) => {
    const query = subwaySearchSchema.safeParse(context.req.query());
    if (!query.success) {
      return context.json(
        {
          error: "INVALID_LOCATION",
          message: "서울 서비스 범위의 위도, 경도, 반경을 입력해 주세요.",
        },
        400,
      );
    }

    const { lat, lng, radius } = query.data;
    const cacheKey = `${lat.toFixed(3)}:${lng.toFixed(3)}:${radius}`;
    const cached = subwayCache.get(cacheKey);
    if (cached && now() - cached.savedAt < SUBWAY_CACHE_TTL_MS) {
      return context.json({ stations: cached.stations });
    }

    const overpassQuery = [
      "[out:json][timeout:12];",
      `nwr["railway"="station"]["station"="subway"](around:${radius},${lat},${lng});`,
      "out center tags;",
    ].join("");

    const availableMirrors = OVERPASS_ENDPOINTS.filter(
      (endpoint) =>
        now() - (subwayMirrorFailedAt.get(endpoint) ?? Number.NEGATIVE_INFINITY) >=
        SUBWAY_MIRROR_COOLDOWN_MS,
    );
    const mirrors =
      availableMirrors.length > 0 ? availableMirrors : [...OVERPASS_ENDPOINTS];
    const deadline = now() + SUBWAY_TOTAL_BUDGET_MS;

    try {
      let stations: SubwayStation[] | null = null;
      let lastError: unknown = null;
      let attempted = false;
      for (const endpoint of mirrors) {
        if (attempted && now() > deadline - 1_000) {
          break;
        }
        attempted = true;
        try {
          const response = await upstreamFetch(endpoint, {
            method: "POST",
            headers: {
              ...UPSTREAM_HEADERS,
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({ data: overpassQuery }),
            signal: AbortSignal.timeout(SUBWAY_ATTEMPT_TIMEOUT_MS),
          });
          if (!response.ok) {
            throw new Error(
              `Subway stations upstream returned ${response.status}`,
            );
          }
          stations = normalizeNearbySubwayStations(await response.json(), {
            lat,
            lng,
          });
          subwayMirrorFailedAt.delete(endpoint);
          break;
        } catch (error) {
          subwayMirrorFailedAt.set(endpoint, now());
          lastError = error;
        }
      }
      if (stations === null) {
        throw lastError ?? new Error("Unknown upstream failure");
      }
      subwayCache.set(cacheKey, { stations, savedAt: now() });
      return context.json({ stations });
    } catch (error) {
      if (cached) {
        return context.json({ stations: cached.stations });
      }
      const detail = error instanceof Error ? error.message : "Unknown upstream failure";
      return context.json(
        {
          error: "UPSTREAM_UNAVAILABLE",
          message: "지하철역 정보를 불러오지 못했습니다.",
          detail,
        },
        502,
      );
    }
  });

  app.get("/api/arrivals/:arsId", async (context) => {
    const params = arrivalLookupSchema.safeParse(context.req.param());
    if (!params.success) {
      return context.json(
        {
          error: "INVALID_ARS_ID",
          message: "ARS 번호는 5자리 숫자여야 합니다.",
        },
        400,
      );
    }

    try {
      const response = await upstreamFetch(ARRIVALS_URL, {
        method: "POST",
        headers: {
          ...UPSTREAM_HEADERS,
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        },
        body: new URLSearchParams({ arsId: params.data.arsId }).toString(),
        signal: AbortSignal.timeout(8_000),
      });
      if (!response.ok) {
        throw new Error(`Arrivals upstream returned ${response.status}`);
      }

      const arrivals = normalizeArrivals(await response.json());
      return context.json({ arrivals, updatedAt: new Date().toISOString() });
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Unknown upstream failure";
      return context.json(
        {
          error: "UPSTREAM_UNAVAILABLE",
          message: "실시간 도착 정보를 불러오지 못했습니다.",
          detail,
        },
        502,
      );
    }
  });

  return app;
}
