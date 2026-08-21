import { Hono } from "hono";
import { arrivalLookupSchema, nearbySearchSchema } from "../src/domain/bus";
import {
  subwayArrivalLookupSchema,
  subwaySearchSchema,
} from "../src/domain/subway";
import { fetchArrivals, fetchNearbyStops } from "./upstream/seoulBus";
import { createOverpassStations } from "./upstream/overpassStations";
import { fetchSubwayArrivals } from "./upstream/subwayArrivals";
import { errorDetail } from "./upstream/upstreamError";

type UpstreamFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

interface AppDeps {
  readonly now?: () => number;
  readonly sleep?: (ms: number) => Promise<void>;
  readonly subwayArrivalUpstream?: string;
}

/** Hono routing boundary: parse/validate input, call one upstream adapter,
 * map failures onto fixed JSON error shapes. Upstream IO lives in
 * `server/upstream/*`. */
export function createApp(
  upstreamFetch: UpstreamFetch = globalThis.fetch,
  deps: AppDeps = {},
) {
  const overpass = createOverpassStations(upstreamFetch, {
    now: deps.now,
    sleep: deps.sleep,
  });
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

    try {
      const stops = await fetchNearbyStops(upstreamFetch, query.data);
      return context.json({ stops });
    } catch (error) {
      return context.json(
        {
          error: "UPSTREAM_UNAVAILABLE",
          message: "정류장 정보를 불러오지 못했습니다.",
          detail: errorDetail(error),
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

    try {
      const stations = await overpass.fetchNearbyStations(query.data);
      return context.json({ stations });
    } catch (error) {
      return context.json(
        {
          error: "UPSTREAM_UNAVAILABLE",
          message: "지하철역 정보를 불러오지 못했습니다.",
          detail: errorDetail(error),
        },
        502,
      );
    }
  });

  app.get("/api/subway/arrivals", async (context) => {
    const query = subwayArrivalLookupSchema.safeParse(context.req.query());
    if (!query.success) {
      return context.json(
        {
          error: "INVALID_STATION",
          message: "역 이름을 입력해 주세요.",
        },
        400,
      );
    }

    try {
      const result = await fetchSubwayArrivals(
        upstreamFetch,
        query.data.station,
        deps.subwayArrivalUpstream,
      );
      return context.json(result);
    } catch (error) {
      return context.json(
        {
          error: "UPSTREAM_UNAVAILABLE",
          message: "지하철 도착 정보를 불러오지 못했습니다.",
          detail: errorDetail(error),
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
      const arrivals = await fetchArrivals(upstreamFetch, params.data.arsId);
      return context.json({ arrivals, updatedAt: new Date().toISOString() });
    } catch (error) {
      return context.json(
        {
          error: "UPSTREAM_UNAVAILABLE",
          message: "실시간 도착 정보를 불러오지 못했습니다.",
          detail: errorDetail(error),
        },
        502,
      );
    }
  });

  return app;
}
