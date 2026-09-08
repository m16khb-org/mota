import {
	type SubwayArrival,
	apiStationName,
	normalizeSubwayArrivals,
} from "@mota/contracts/subway";
import { z } from "zod";
import { UPSTREAM_HEADERS } from "./seoulBus";
import {
	SEOUL_SUBWAY_QUOTA_CODE,
	UpstreamError,
} from "./upstreamError";

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

const quotaPayloadSchema = z.union([
	z.object({
		status: z.union([z.number(), z.string()]).optional(),
		code: z.string(),
		message: z.string().nullable().optional(),
	}),
	z.object({
		errorMessage: z.object({
			status: z.union([z.number(), z.string()]).optional(),
			code: z.string(),
			message: z.string().nullable().optional(),
		}),
	}),
]);

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
	let payload: unknown;
	try {
		payload = await response.json();
	} catch {
		payload = undefined;
	}
	const quotaError = quotaPayloadSchema.safeParse(payload);
	const errorMessage = quotaError.success
		? "errorMessage" in quotaError.data
			? quotaError.data.errorMessage
			: quotaError.data
		: null;
	if (errorMessage?.code === SEOUL_SUBWAY_QUOTA_CODE) {
			const status =
				errorMessage.status === undefined
					? response.status
					: errorMessage.status;
			const message = errorMessage.message
				? `: ${errorMessage.message}`
				: "";
			throw new UpstreamError(
				"Subway arrivals upstream failed",
				`Subway arrivals upstream returned ${status} ${errorMessage.code}${message}`,
			);
	}
	if (!response.ok) {
		throw new UpstreamError(
			"Subway arrivals upstream failed",
			`Subway arrivals upstream returned ${response.status}`,
		);
	}
	return normalizeSubwayArrivals(payload);
}
