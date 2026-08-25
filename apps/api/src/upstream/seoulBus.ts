import {
  normalizeArrivals,
  normalizeNearbyStops,
  normalizeStopCatalog,
  type BusArrival,
  type BusStop,
} from "@mota/contracts/bus";
import { UpstreamError } from "./upstreamError";

const NEARBY_STOPS_URL = "https://bus.go.kr/sbus/bus/selectNearStops.do";
const ARRIVALS_URL = "http://m.bus.go.kr/mBus/bus/getStationByUid.bms";
const BUS_CATALOG_MAX_RESPONSE_BYTES = 10 * 1_024 * 1_024;
export const BUS_CATALOG_LOCATION = {
  lat: 37.55,
  lng: 127,
  radius: 45_000,
} as const;

export const UPSTREAM_HEADERS = {
  Accept: "application/json",
  "User-Agent": "mota/0.1 (+https://mota.m16khb.xyz)",
} as const;

type UpstreamFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

/** Seoul BIS driven adapter: nearby-stop lookup and ARS arrivals. */
export async function fetchNearbyStops(
  upstreamFetch: UpstreamFetch,
  location: { readonly lat: number; readonly lng: number; readonly radius: number },
): Promise<BusStop[]> {
  const upstreamUrl = new URL(NEARBY_STOPS_URL);
  upstreamUrl.search = new URLSearchParams({
    kiloMeter: String(location.radius / 1000),
    lati: String(location.lat),
    longi: String(location.lng),
  }).toString();

  const response = await upstreamFetch(upstreamUrl.toString(), {
    headers: UPSTREAM_HEADERS,
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) {
    throw new UpstreamError(
      "Nearby stops upstream failed",
      `Nearby stops upstream returned ${response.status}`,
    );
  }
  return normalizeNearbyStops(await response.json());
}

/** Load the complete Seoul-area stop catalog for the application cache. */
export async function fetchStopCatalog(
  upstreamFetch: UpstreamFetch,
): Promise<BusStop[]> {
  const upstreamUrl = new URL(NEARBY_STOPS_URL);
  upstreamUrl.search = new URLSearchParams({
    kiloMeter: String(BUS_CATALOG_LOCATION.radius / 1_000),
    lati: String(BUS_CATALOG_LOCATION.lat),
    longi: String(BUS_CATALOG_LOCATION.lng),
  }).toString();

  const response = await upstreamFetch(upstreamUrl.toString(), {
    headers: UPSTREAM_HEADERS,
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    throw new UpstreamError(
      "Stop catalog upstream failed",
      `Stop catalog upstream returned ${response.status}`,
    );
  }
  const body = await response.text();
  if (new TextEncoder().encode(body).byteLength > BUS_CATALOG_MAX_RESPONSE_BYTES) {
    throw new UpstreamError(
      "Stop catalog upstream failed",
      "Stop catalog upstream response exceeded 10 MiB",
    );
  }
  return normalizeStopCatalog(JSON.parse(body));
}

export async function fetchArrivals(
  upstreamFetch: UpstreamFetch,
  arsId: string,
): Promise<BusArrival[]> {
  const response = await upstreamFetch(ARRIVALS_URL, {
    method: "POST",
    headers: {
      ...UPSTREAM_HEADERS,
      "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
    },
    body: new URLSearchParams({ arsId }).toString(),
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) {
    throw new UpstreamError(
      "Arrivals upstream failed",
      `Arrivals upstream returned ${response.status}`,
    );
  }
  return normalizeArrivals(await response.json());
}

