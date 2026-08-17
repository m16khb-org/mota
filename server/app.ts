import { Hono } from "hono";
import {
  arrivalLookupSchema,
  nearbySearchSchema,
  normalizeArrivals,
  normalizeNearbyStops,
} from "../src/domain/bus";

type UpstreamFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

const NEARBY_STOPS_URL = "https://bus.go.kr/sbus/bus/selectNearStops.do";
const ARRIVALS_URL = "http://m.bus.go.kr/mBus/bus/getStationByUid.bms";

const UPSTREAM_HEADERS = {
  Accept: "application/json",
  "User-Agent": "commute-bus-web/0.1 (+https://bus.go.kr)",
} as const;

export function createApp(upstreamFetch: UpstreamFetch = globalThis.fetch) {
  const app = new Hono();

  app.get("/api/health", (context) =>
    context.json({ status: "ok", service: "commute-bus-web" }),
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
