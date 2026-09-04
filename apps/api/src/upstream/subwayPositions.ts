import {
	transitVehicleSchema,
	type TransitVehicle,
} from "@mota/contracts/transit-map";
import { z } from "zod";
import { loadSubwayNetwork } from "../transit-map/subwayNetworkSource";
import { UPSTREAM_HEADERS } from "./seoulBus";
import { UpstreamError } from "./upstreamError";

const SEOUL_SUBWAY_OPEN_API_BASE = "http://swopenAPI.seoul.go.kr";
const LINE_PLACEHOLDER = "{line}";

const upstreamSchema = z.object({
	errorMessage: z.object({
		status: z.union([z.number(), z.string()]).optional(),
		code: z.string().min(1),
		message: z.string().default(""),
	}),
	realtimePositionList: z
		.array(
			z.object({
				subwayId: z.string().trim().min(1),
				statnId: z.string().trim().min(1),
				statnNm: z.string().trim().min(1),
				trainNo: z.string().trim().min(1),
				recptnDt: z.string().trim().min(1),
				updnLine: z.string().trim().min(1),
				trainSttus: z.string().trim().min(1),
			}),
		)
		.optional(),
});

type UpstreamFetch = (
	input: string | URL | Request,
	init?: RequestInit,
) => Promise<Response>;

export type SubwayPositionResult = Readonly<{
	availability: "live" | "no-service";
	vehicles: readonly TransitVehicle[];
	capturedAt: string;
}>;

const stationCoordinates = new Map<string, readonly [number, number]>();
for (const station of loadSubwayNetwork().stations.features) {
	for (const routeId of station.properties.routeIds) {
		stationCoordinates.set(
			stationKey(station.properties.stationName, routeId),
			station.geometry.coordinates,
		);
	}
}

export function officialSubwayPositionTemplate(apiKey: string): string {
	return [
		SEOUL_SUBWAY_OPEN_API_BASE,
		"api",
		"subway",
		encodeURIComponent(apiKey),
		"json",
		"realtimePosition",
		"0",
		"100",
		LINE_PLACEHOLDER,
	].join("/");
}

export async function fetchSubwayPositions(
	upstreamFetch: UpstreamFetch,
	template: string,
	line: string,
): Promise<SubwayPositionResult> {
	const upstreamUrl = template.replace(LINE_PLACEHOLDER, encodeURIComponent(line));
	const response = await upstreamFetch(upstreamUrl, {
		headers: UPSTREAM_HEADERS,
		signal: AbortSignal.timeout(8_000),
	});
	if (!response.ok) {
		throw new UpstreamError(
			"Subway positions upstream failed",
			`Subway positions for ${line} returned ${response.status}`,
		);
	}
	const payload = upstreamSchema.parse(await response.json());
	if (payload.errorMessage.code === "INFO-200") {
		return Object.freeze({
			availability: "no-service" as const,
			vehicles: Object.freeze([]),
			capturedAt: new Date().toISOString(),
		});
	}
	if (payload.errorMessage.code !== "INFO-000") {
		throw new UpstreamError(
			"Subway positions upstream failed",
			`Subway positions for ${line} returned ${payload.errorMessage.code}`,
		);
	}
	const routeId = normalizeRouteId(line);
	const vehicles = (payload.realtimePositionList ?? []).flatMap((row) => {
		const coordinates = stationCoordinates.get(stationKey(row.statnNm, routeId));
		if (!coordinates) return [];
		return [
			transitVehicleSchema.parse({
				id: `subway:${row.subwayId}:${row.trainNo}`,
				mode: "subway",
				routeId: row.subwayId,
				routeName: line,
				coordinates,
				bearing: 0,
				direction: row.updnLine,
				capturedAt: parseSeoulTimestamp(row.recptnDt),
				positionBasis: "station-segment",
			}),
		];
	});
	const capturedAt = vehicles.reduce(
		(latest, vehicle) =>
			vehicle.capturedAt > latest ? vehicle.capturedAt : latest,
		"1970-01-01T00:00:00.000Z",
	);
	return Object.freeze({
		availability: vehicles.length > 0 ? ("live" as const) : ("no-service" as const),
		vehicles: Object.freeze(vehicles),
		capturedAt:
			vehicles.length > 0 ? capturedAt : new Date().toISOString(),
	});
}

function normalizeStationName(value: string) {
	return value.replace(/\([^)]*\)/g, "").replace(/역$/, "").replace(/\s+/g, "").trim();
}

function stationKey(stationName: string, routeId: string) {
	return `${normalizeStationName(stationName)}:${routeId}`;
}

function normalizeRouteId(line: string) {
	const withoutLineSuffix = line.replace(/호선$/, "").replace(/선$/, "");
	if (withoutLineSuffix === "경의중앙") return "경의·중앙";
	if (withoutLineSuffix === "수인분당") return "수인·분당";
	return withoutLineSuffix;
}

function parseSeoulTimestamp(value: string) {
	const instant = new Date(`${value.trim().replace(" ", "T")}+09:00`);
	if (Number.isNaN(instant.getTime())) {
		throw new UpstreamError(
			"Subway positions timestamp invalid",
			"Subway positions returned an invalid capture timestamp",
		);
	}
	return instant.toISOString();
}
