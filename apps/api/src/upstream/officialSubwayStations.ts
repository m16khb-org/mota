import {
  normalizeOfficialSubwayStationCatalog,
  type SubwayStationPoint,
} from "@mota/contracts/subway";
import { UPSTREAM_HEADERS } from "./seoulBus";
import { UpstreamError } from "./upstreamError";

const OFFICIAL_SUBWAY_CATALOG_URL =
  "https://t-data.seoul.go.kr/dataprovide/download.do?id=10229";
const SUBWAY_CATALOG_MAX_RESPONSE_BYTES = 1 * 1_024 * 1_024;

type UpstreamFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

/** Load the quarterly official station-master CSV from Seoul T-Data. */
export async function fetchSubwayStationCatalog(
  upstreamFetch: UpstreamFetch,
): Promise<SubwayStationPoint[]> {
  const response = await upstreamFetch(OFFICIAL_SUBWAY_CATALOG_URL, {
    headers: UPSTREAM_HEADERS,
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    throw new UpstreamError(
      "Subway catalog upstream failed",
      `Subway catalog upstream returned ${response.status}`,
    );
  }
  const body = await response.text();
  if (
    new TextEncoder().encode(body).byteLength >
    SUBWAY_CATALOG_MAX_RESPONSE_BYTES
  ) {
    throw new UpstreamError(
      "Subway catalog upstream failed",
      "Subway catalog upstream response exceeded 1 MiB",
    );
  }
  return normalizeOfficialSubwayStationCatalog(body);
}
