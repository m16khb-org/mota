import {
	subwayVehicleSchema,
	type SubwayVehicle,
} from "@mota/contracts/transit-map";
import { z } from "zod";
import { loadSubwayNetwork } from "../transit-map/subwayNetworkSource";
import { UPSTREAM_HEADERS } from "./seoulBus";
import {
  SEOUL_SUBWAY_QUOTA_CODE,
  UpstreamError,
} from "./upstreamError";

const SEOUL_SUBWAY_OPEN_API_BASE = "http://swopenAPI.seoul.go.kr";
const LINE_PLACEHOLDER = "{line}";
export const SUBWAY_POSITION_QUOTA_CODE = SEOUL_SUBWAY_QUOTA_CODE;

const upstreamErrorSchema = z.object({
	status: z.union([z.number(), z.string()]).optional(),
	code: z.string().min(1),
	message: z.string().default(""),
});

const positionRowSchema = z.object({
	subwayId: z.string().trim().min(1),
	statnId: z.string().trim().min(1),
	statnNm: z.string().trim().min(1),
	trainNo: z.string().trim().min(1),
	recptnDt: z.string().trim().min(1),
	updnLine: z.string().trim().min(1),
	trainSttus: z.string().trim().min(1),
});

const upstreamSchema = z.union([
	z.object({
		errorMessage: upstreamErrorSchema,
		realtimePositionList: z.array(positionRowSchema).optional(),
	}),
	upstreamErrorSchema,
]);

type UpstreamPositionRow = z.infer<typeof positionRowSchema>;

type UpstreamFetch = (
	input: string | URL | Request,
	init?: RequestInit,
) => Promise<Response>;

export type SubwayPositionResult = Readonly<{
	availability: "live" | "no-service";
	vehicles: readonly SubwayVehicle[];
	capturedAt: string;
}>;

export function isSubwayPositionQuotaError(error: unknown) {
	return (
		error instanceof UpstreamError &&
		error.detail.includes(SUBWAY_POSITION_QUOTA_CODE)
	);
}

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
	let rawPayload: unknown;
	try {
		rawPayload = await response.json();
	} catch (error) {
		if (!response.ok) {
			throw new UpstreamError(
				"Subway positions upstream failed",
				`Subway positions for ${line} returned ${response.status}`,
			);
		}
		throw error;
	}
	const parsedPayload = upstreamSchema.safeParse(rawPayload);
	const quotaErrorMessage = parsedPayload.success
		? "errorMessage" in parsedPayload.data
			? parsedPayload.data.errorMessage
			: parsedPayload.data
		: null;
	if (quotaErrorMessage?.code === SUBWAY_POSITION_QUOTA_CODE) {
		throw new UpstreamError(
			"Subway positions upstream failed",
			describeUpstreamError(line, quotaErrorMessage),
		);
	}
	if (!response.ok) {
		throw new UpstreamError(
			"Subway positions upstream failed",
			`Subway positions for ${line} returned ${response.status}`,
		);
	}
	const payload = parsedPayload.success
		? parsedPayload.data
		: upstreamSchema.parse(rawPayload);
	const errorMessage =
		"errorMessage" in payload ? payload.errorMessage : payload;
	if (errorMessage.code === "INFO-200") {
		return Object.freeze({
			availability: "no-service" as const,
			vehicles: Object.freeze([]),
			capturedAt: new Date().toISOString(),
		});
	}
	if (errorMessage.code !== "INFO-000") {
		throw new UpstreamError(
			"Subway positions upstream failed",
			describeUpstreamError(line, errorMessage),
		);
	}
	const routeId = normalizeRouteId(line);
	const latestRowsById = new Map<
		string,
		{ row: UpstreamPositionRow; capturedAt: string }
	>();
	const rows =
		"errorMessage" in payload ? payload.realtimePositionList ?? [] : [];
	for (const row of rows) {
		const capturedAt = parseSeoulTimestamp(row.recptnDt);
		const id = `subway:${row.subwayId}:${row.trainNo}`;
		const existing = latestRowsById.get(id);
		if (!existing || capturedAt > existing.capturedAt) {
			latestRowsById.set(id, { row, capturedAt });
		}
	}
	const vehicles = [...latestRowsById.values()].flatMap(({ row, capturedAt }) => {
		const coordinates = resolveStationCoordinates(row.statnNm, routeId);
		if (!coordinates) return [];
		return [
			subwayVehicleSchema.parse({
				id: `subway:${row.subwayId}:${row.trainNo}`,
				mode: "subway",
				routeId: row.subwayId,
				routeName: line,
				coordinates,
				bearing: 0,
				direction: normalizeDirection(row.updnLine),
				capturedAt,
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

function describeUpstreamError(
	line: string,
	errorMessage: z.infer<typeof upstreamErrorSchema>,
) {
	const status =
		errorMessage.status === undefined ? "" : ` (status ${errorMessage.status})`;
	const message = errorMessage.message ? `: ${errorMessage.message}` : "";
	return `Subway positions for ${line} returned ${errorMessage.code}${status}${message}`;
}

function normalizeStationName(value: string) {
	return value.replace(/\([^)]*\)/g, "").replace(/역$/, "").replace(/\s+/g, "").trim();
}

function stationKey(stationName: string, routeId: string) {
	return `${normalizeStationName(stationName)}:${routeId}`;
}

function resolveStationCoordinates(stationName: string, routeId: string) {
	return stationCoordinates.get(stationKey(stationName, routeId));
}

function normalizeRouteId(line: string) {
	const withoutLineSuffix = line.replace(/호선$/, "").replace(/선$/, "");
	if (withoutLineSuffix === "경의중앙") return "경의·중앙";
	if (withoutLineSuffix === "수인분당") return "수인·분당";
	if (withoutLineSuffix === "우이신설") return "W";
	return withoutLineSuffix;
}

function normalizeDirection(value: string) {
	if (value === "0") return "상행/내선";
	if (value === "1") return "하행/외선";
	return value;
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
