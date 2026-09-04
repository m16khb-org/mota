import { Inject, Injectable } from "@nestjs/common";
import {
	transitMapNetworkSchema,
	type TransitMapNetwork,
	type TransitMapQuery,
	viewportAreaSquareKm,
} from "@mota/contracts";
import type { BusStop } from "@mota/contracts/bus";
import { TransitCatalogService } from "../transit/transitCatalog.service";
import {
	filterSubwayNetwork,
	subwayNetworkGeneratedAt,
	subwayNetworkRevision,
} from "./subwayNetworkSource";

export interface BusRouteTopology {
	readonly routeId: string;
	readonly routeName: string;
	readonly color: string;
	readonly stopIds: readonly string[];
	readonly path: readonly (readonly [number, number])[];
}

export interface BusTopologyPort {
	routesForStops(stopIds: readonly string[]): Promise<readonly BusRouteTopology[]>;
}

export interface TransitMapNetworkOptions {
	readonly busConfigured: boolean;
}

export const BUS_TOPOLOGY_PORT = Symbol("BUS_TOPOLOGY_PORT");
export const TRANSIT_MAP_NETWORK_OPTIONS = Symbol("TRANSIT_MAP_NETWORK_OPTIONS");

export class EmptyBusTopologyPort implements BusTopologyPort {
	async routesForStops(_stopIds: readonly string[]) {
		return [];
	}
}

type NearbyStopCatalog = Pick<TransitCatalogService, "nearbyStops">;

const emptyRoutes = { type: "FeatureCollection" as const, features: [] };
const emptyStops = { type: "FeatureCollection" as const, features: [] };

@Injectable()
export class TransitMapNetworkService {
	constructor(
		@Inject(TransitCatalogService)
		private readonly catalogs: NearbyStopCatalog,
		@Inject(BUS_TOPOLOGY_PORT)
		private readonly topology: BusTopologyPort,
		@Inject(TRANSIT_MAP_NETWORK_OPTIONS)
		private readonly options: TransitMapNetworkOptions,
	) {}

	async network(query: TransitMapQuery): Promise<TransitMapNetwork> {
		const subway = filterSubwayNetwork(query);
		if (!this.options.busConfigured) {
			return this.compose(query, subway, [], [], "unconfigured");
		}
		if (query.zoom < 16 || viewportAreaSquareKm(query) > 4) {
			return this.compose(query, subway, [], [], "zoom-required");
		}

		const stops = (await this.catalogs.nearbyStops(searchCircle(query))).filter(
			(stop) => stopInside(stop, query),
		);
		const routes = await this.topology.routesForStops(
			stops.map((stop) => stop.arsId ?? String(stop.id)),
		);
		if (routes.length > 40) {
			return this.compose(query, subway, [], [], "zoom-required");
		}
		return this.compose(query, subway, routes, stops);
	}

	private compose(
		query: TransitMapQuery,
		subway: TransitMapNetwork["subway"],
		routes: readonly BusRouteTopology[],
		stops: readonly BusStop[],
		reason?: "zoom-required" | "unconfigured",
	): TransitMapNetwork {
		const routeIdsByStop = new Map<string, string[]>();
		for (const route of routes) {
			for (const stopId of route.stopIds) {
				const routeIds = routeIdsByStop.get(stopId) ?? [];
				routeIds.push(route.routeId);
				routeIdsByStop.set(stopId, routeIds);
			}
		}
		const routeFeatures = routes.map((route) => ({
			type: "Feature" as const,
			properties: {
				routeId: route.routeId,
				routeName: route.routeName,
				color: route.color,
			},
			geometry: {
				type: "LineString" as const,
				coordinates: route.path,
			},
		}));
		const stopFeatures = stops.map((stop) => ({
			type: "Feature" as const,
			properties: {
				stopId: String(stop.id),
				arsId: stop.arsId,
				stopName: stop.name,
				routeIds: [
					...(routeIdsByStop.get(String(stop.id)) ?? []),
					...(stop.arsId ? (routeIdsByStop.get(stop.arsId) ?? []) : []),
				].filter((routeId, index, routeIds) => routeIds.indexOf(routeId) === index).sort(),
			},
			geometry: {
				type: "Point" as const,
				coordinates: [stop.lng, stop.lat] as const,
			},
		}));
		const queryRevision = [
			query.west,
			query.south,
			query.east,
			query.north,
			query.zoom,
		]
			.map((value) => value.toFixed(6))
			.join(":");
		return transitMapNetworkSchema.parse({
			revision: `${subwayNetworkRevision}:${queryRevision}:${routes
				.map((route) => route.routeId)
				.sort()
				.join(",")}`,
			generatedAt: subwayNetworkGeneratedAt,
			subway,
			bus: {
				enabled: reason === undefined,
				...(reason === undefined ? {} : { reason }),
				attribution: "서울특별시 교통정보",
				routes:
					reason === undefined
						? { type: "FeatureCollection", features: routeFeatures }
						: emptyRoutes,
				stops:
					reason === undefined
						? { type: "FeatureCollection", features: stopFeatures }
						: emptyStops,
			},
		});
	}
}

function stopInside(stop: BusStop, query: TransitMapQuery) {
	return (
		stop.lng >= query.west &&
		stop.lng <= query.east &&
		stop.lat >= query.south &&
		stop.lat <= query.north
	);
}

function searchCircle(query: TransitMapQuery) {
	const lat = (query.south + query.north) / 2;
	const lng = (query.west + query.east) / 2;
	const latitudeKm = (query.north - query.south) * 111.195;
	const longitudeKm =
		(query.east - query.west) * 111.195 * Math.cos((lat * Math.PI) / 180);
	return {
		lat,
		lng,
		radius: Math.ceil((Math.hypot(latitudeKm, longitudeKm) / 2) * 1_000),
	};
}
