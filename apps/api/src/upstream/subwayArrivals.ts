import {
	type SubwayArrival,
	apiStationName,
	normalizeSubwayArrivals,
} from "@mota/contracts/subway";
import { UPSTREAM_HEADERS } from "./seoulBus";
import { UpstreamError } from "./upstreamError";

export const SUBWAY_ARRIVAL_UPSTREAM_BASE =
	process.env.SUBWAY_ARRIVAL_UPSTREAM ??
	"https://k-skill-proxy.nomadamas.org";
export const SEOUL_SUBWAY_OPEN_API_BASE =
	"http://swopenAPI.seoul.go.kr";

type UpstreamFetch = (
	input: string | URL | Request,
	init?: RequestInit,
) => Promise<Response>;

const STATION_PLACEHOLDER = "{station}";

function subwayArrivalUrl(
	station: string,
	upstreamBase: string,
): URL {
	const stationName = apiStationName(station);
	if (upstreamBase.includes(STATION_PLACEHOLDER)) {
		return new URL(
			upstreamBase.replace(
				STATION_PLACEHOLDER,
				encodeURIComponent(stationName),
			),
		);
	}

	const upstreamUrl = new URL(
		"/v1/seoul-subway/arrival",
		upstreamBase,
	);
	upstreamUrl.search = new URLSearchParams({
		station: stationName,
	}).toString();
	return upstreamUrl;
}

export function officialSubwayArrivalTemplate(apiKey: string): string {
	return [
		SEOUL_SUBWAY_OPEN_API_BASE,
		"api",
		"subway",
		encodeURIComponent(apiKey),
		"json",
		"realtimeStationArrival",
		"0",
		"100",
		STATION_PLACEHOLDER,
	].join("/");
}

/** Live arrival adapter supporting official URL templates and proxy origins. */
export async function fetchSubwayArrivals(
	upstreamFetch: UpstreamFetch,
	station: string,
	upstreamBase = SUBWAY_ARRIVAL_UPSTREAM_BASE,
): Promise<{ arrivals: SubwayArrival[]; updatedAt: string }> {
	const upstreamUrl = subwayArrivalUrl(station, upstreamBase);

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
	return normalized;
}
