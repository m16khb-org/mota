import {
  type SubwayArrival,
  apiStationName,
  normalizeSubwayArrivals,
} from "@mota/contracts/subway";
import { UPSTREAM_HEADERS } from "./seoulBus";
import { UpstreamError } from "./upstreamError";

const SUBWAY_ARRIVAL_UPSTREAM =
  process.env.SUBWAY_ARRIVAL_UPSTREAM ??
  "https://k-skill-proxy.nomadamas.org";

type UpstreamFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

/** k-skill proxy driven adapter for live Seoul subway arrivals. */
export async function fetchSubwayArrivals(
  upstreamFetch: UpstreamFetch,
  station: string,
  upstreamBase = SUBWAY_ARRIVAL_UPSTREAM,
): Promise<{ arrivals: SubwayArrival[]; updatedAt: string }> {
  const upstreamUrl = new URL("/v1/seoul-subway/arrival", upstreamBase);
  upstreamUrl.search = new URLSearchParams({
    station: apiStationName(station),
  }).toString();

  const response = await upstreamFetch(upstreamUrl.toString(), {
    headers: UPSTREAM_HEADERS,
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) {
    throw new UpstreamError(
      "Subway arrivals upstream failed",
      `Subway arrivals upstream returned ${response.status}`,
    );
  }
  const normalized = normalizeSubwayArrivals(await response.json());
  // `updatedAt` must be the adapter receipt time (like the bus route), not
  // the upstream `recptnDt` data time: the 90-second freshness rule and the
  // countdown `elapsed` both key on it, and upstream data timestamps can lag
  // receipt by minutes, marking fresh data stale and dropping imminent trains.
  return { arrivals: normalized.arrivals, updatedAt: new Date().toISOString() };
}
