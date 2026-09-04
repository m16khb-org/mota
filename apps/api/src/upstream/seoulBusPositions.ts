import {
	transitVehicleSchema,
	type TransitVehicle,
} from "@mota/contracts/transit-map";
import { z } from "zod";
import type { BusRouteTopology } from "../transit-map/transitMapNetwork.service";
import { UPSTREAM_HEADERS } from "./seoulBus";
import { UpstreamError } from "./upstreamError";

const BUS_API_BASE = "http://ws.bus.go.kr/api/rest";
const TOPOLOGY_CACHE_MS = 24 * 60 * 60 * 1_000;

type UpstreamFetch = (
	input: string | URL | Request,
	init?: RequestInit,
) => Promise<Response>;

export interface BusRouteSummary {
	readonly routeId: string;
	readonly routeName: string;
	readonly color: string;
}

export interface BusPositionResult {
	readonly availability: "live" | "no-service";
	readonly vehicles: readonly TransitVehicle[];
	readonly capturedAt: string;
}

interface Bounds {
	readonly west: number;
	readonly south: number;
	readonly east: number;
	readonly north: number;
}

interface Cached<T> {
	readonly expiresAt: number;
	readonly value: Promise<T>;
}

export class OfficialBusTopologyPort {
	private readonly stopRoutes = new Map<string, Cached<readonly BusRouteSummary[]>>();
	private readonly routeTopologies = new Map<string, Cached<BusRouteTopology>>();
	private readonly summaries = new Map<string, BusRouteSummary>();
	private readonly limiter = new RequestLimiter(8);
	private readonly limitedFetch: UpstreamFetch;

	constructor(
		fetcher: UpstreamFetch,
		private readonly apiKey: string,
		private readonly now: () => number = Date.now,
	) {
		this.limitedFetch = (input, init) =>
			this.limiter.run(() => fetcher(input, init));
	}

	async routesForStops(stopIds: readonly string[]) {
		const summaries = await Promise.all(
			[...new Set(stopIds)].map((stopId) => this.routesAtStop(stopId)),
		);
		const routes = new Map<string, BusRouteSummary>();
		for (const route of summaries.flat()) {
			routes.set(route.routeId, route);
			this.summaries.set(route.routeId, route);
		}
		return Promise.all(
			[...routes.values()]
				.sort((left, right) => left.routeId.localeCompare(right.routeId))
				.map((route) => this.topologyForRoute(route)),
		);
	}

	routeSummary(routeId: string) {
		return this.summaries.get(routeId);
	}

	private routesAtStop(stopId: string) {
		return this.cached(this.stopRoutes, stopId, () =>
			fetchBusRoutesForStop(this.limitedFetch, this.apiKey, stopId),
		);
	}

	private topologyForRoute(route: BusRouteSummary) {
		return this.cached(this.routeTopologies, route.routeId, () =>
			fetchBusRouteTopology(this.limitedFetch, this.apiKey, route),
		);
	}

	private cached<T>(
		cache: Map<string, Cached<T>>,
		key: string,
		load: () => Promise<T>,
	): Promise<T> {
		const current = cache.get(key);
		if (current && current.expiresAt > this.now()) return current.value;
		const value = load().catch((error) => {
			cache.delete(key);
			throw error;
		});
		cache.set(key, { expiresAt: this.now() + TOPOLOGY_CACHE_MS, value });
		return value;
	}
}

class RequestLimiter {
	private active = 0;
	private readonly queue: Array<() => void> = [];

	constructor(private readonly maximum: number) {}

	async run<T>(task: () => Promise<T>): Promise<T> {
		if (this.active >= this.maximum) {
			await new Promise<void>((resolve) => this.queue.push(resolve));
		}
		this.active += 1;
		try {
			return await task();
		} finally {
			this.active -= 1;
			this.queue.shift()?.();
		}
	}
}

const headerSchema = z.object({
	headerCd: z.union([z.string(), z.number()]).transform(String),
	headerMsg: z.string().default(""),
});

const envelopeSchema = <T extends z.ZodType>(rowSchema: T) =>
	z.object({
		msgHeader: headerSchema,
		msgBody: z
			.object({
				itemList: z.preprocess(
					(value) =>
						value === undefined || value === null
							? []
							: Array.isArray(value)
								? value
								: [value],
					z.array(rowSchema),
				),
			})
			.default({ itemList: [] }),
	});

const routeRowSchema = z.object({
	busRouteId: z.coerce.string().trim().min(1),
	busRouteNm: z.coerce.string().trim().min(1),
	routeType: z.coerce.string().trim().default("3"),
});
const stationRowSchema = z.object({
	station: z.coerce.string().trim().min(1),
	stationNm: z.coerce.string().trim().min(1),
	arsId: z.coerce.string().trim().min(1),
	seq: z.coerce.number().int().positive(),
});
const pathRowSchema = z.object({
	gpsX: z.coerce.number().finite(),
	gpsY: z.coerce.number().finite(),
	no: z.coerce.number().int().positive(),
});
const positionRowSchema = z.object({
	vehId: z.coerce.string().trim().min(1),
	plainNo: z.coerce.string().trim().min(1),
	gpsX: z.coerce.number().finite(),
	gpsY: z.coerce.number().finite(),
	sectOrd: z.coerce.number().int().nonnegative(),
});

export async function fetchBusRoutesForStop(
	fetcher: UpstreamFetch,
	apiKey: string,
	stopId: string,
): Promise<readonly BusRouteSummary[]> {
	const payload = await requestJson(
		fetcher,
		"station routes",
		apiUrl("stationinfo/getRouteByStation", apiKey, { arsId: stopId }),
	);
	const parsed = envelopeSchema(routeRowSchema).parse(payload);
	assertSuccess(parsed.msgHeader, "station routes");
	return Object.freeze(
		parsed.msgBody.itemList.map((row) => ({
			routeId: row.busRouteId,
			routeName: row.busRouteNm,
			color: routeColor(row.routeType),
		})),
	);
}

export async function fetchBusRouteTopology(
	fetcher: UpstreamFetch,
	apiKey: string,
	route: BusRouteSummary,
): Promise<BusRouteTopology> {
	const [stationPayload, pathPayload] = await Promise.all([
		requestJson(
			fetcher,
			`route ${route.routeId} stations`,
			apiUrl("busRouteInfo/getStaionByRoute", apiKey, {
				busRouteId: route.routeId,
			}),
		),
		requestJson(
			fetcher,
			`route ${route.routeId} path`,
			apiUrl("busRouteInfo/getRoutePath", apiKey, {
				busRouteId: route.routeId,
			}),
		),
	]);
	const stations = envelopeSchema(stationRowSchema).parse(stationPayload);
	const path = envelopeSchema(pathRowSchema).parse(pathPayload);
	assertSuccess(stations.msgHeader, `route ${route.routeId} stations`);
	assertSuccess(path.msgHeader, `route ${route.routeId} path`);
	return Object.freeze({
		...route,
		stopIds: Object.freeze(
			stations.msgBody.itemList
				.sort((left, right) => left.seq - right.seq)
				.flatMap((station) => [station.station, station.arsId]),
		),
		path: Object.freeze(
			path.msgBody.itemList
				.sort((left, right) => left.no - right.no)
				.map((point) => [point.gpsX, point.gpsY] as const),
		),
	});
}

export async function fetchBusPositions(
	fetcher: UpstreamFetch,
	apiKey: string,
	route: Pick<BusRouteSummary, "routeId" | "routeName">,
	bounds: Bounds,
	now: () => number = Date.now,
): Promise<BusPositionResult> {
	const payload = await requestJson(
		fetcher,
		`route ${route.routeId} positions`,
		apiUrl("buspos/getBusPosByRtid", apiKey, { busRouteId: route.routeId }),
	);
	const parsed = envelopeSchema(positionRowSchema).parse(payload);
	assertSuccess(parsed.msgHeader, `route ${route.routeId} positions`);
	const capturedAt = new Date(now()).toISOString();
	const vehicles = parsed.msgBody.itemList
		.filter(
			(row) =>
				row.gpsX >= bounds.west &&
				row.gpsX <= bounds.east &&
				row.gpsY >= bounds.south &&
				row.gpsY <= bounds.north,
		)
		.map((row) =>
			transitVehicleSchema.parse({
				id: `bus:${route.routeId}:${row.vehId}`,
				mode: "bus",
				routeId: route.routeId,
				routeName: route.routeName,
				coordinates: [row.gpsX, row.gpsY],
				bearing: 0,
				direction: `${row.sectOrd}번째 구간`,
				capturedAt,
				positionBasis: "gps",
			}),
		);
	return Object.freeze({
		availability: vehicles.length > 0 ? ("live" as const) : ("no-service" as const),
		vehicles: Object.freeze(vehicles),
		capturedAt,
	});
}

function apiUrl(path: string, apiKey: string, params: Record<string, string>) {
	const url = new URL(`${BUS_API_BASE}/${path}`);
	url.search = new URLSearchParams({
		serviceKey: apiKey,
		_type: "json",
		...params,
	}).toString();
	return url;
}

async function requestJson(fetcher: UpstreamFetch, source: string, url: URL) {
	let response: Response;
	try {
		response = await fetcher(url.toString(), {
			headers: UPSTREAM_HEADERS,
			signal: AbortSignal.timeout(8_000),
		});
	} catch {
		throw new UpstreamError(
			"Seoul bus map upstream failed",
			`${source} request failed`,
		);
	}
	if (!response.ok) {
		throw new UpstreamError(
			"Seoul bus map upstream failed",
			`${source} returned ${response.status}`,
		);
	}
	return response.json();
}

function assertSuccess(
	header: z.infer<typeof headerSchema>,
	source: string,
) {
	if (header.headerCd !== "0") {
		throw new UpstreamError(
			"Seoul bus map upstream failed",
			`${source} returned ${header.headerCd}`,
		);
	}
}

function routeColor(routeType: string) {
	return (
		{
			"1": "#ef4444",
			"2": "#22c55e",
			"3": "#2563eb",
			"4": "#2563eb",
			"5": "#7c3aed",
			"6": "#f97316",
		}[routeType] ?? "#2563eb"
	);
}
