import { describe, expect, it, vi } from "vitest";
import {
	type BusRouteTopology,
	TransitMapNetworkService,
} from "./transitMapNetwork.service";

const eligibleQuery = {
	west: 127.1,
	south: 37.52,
	east: 127.12,
	north: 37.54,
	zoom: 16,
};

const stop = {
	id: "stop-1",
	arsId: "12345",
	name: "테스트 정류장",
	lat: 37.53,
	lng: 127.11,
	distanceMeters: 10,
};

function route(index = 1): BusRouteTopology {
	return {
		routeId: `route-${index}`,
		routeName: `노선 ${index}`,
		color: "#2563eb",
		stopIds: [stop.id],
		path: [
			[127.105, 37.525],
			[127.115, 37.535],
		],
	};
}

function createService(options: {
	configured?: boolean;
	routes?: readonly BusRouteTopology[];
} = {}) {
	const catalogs = {
		nearbyStops: vi.fn().mockResolvedValue([stop]),
	};
	const topology = {
		routesForStops: vi.fn().mockResolvedValue(options.routes ?? [route()]),
	};
	return {
		catalogs,
		topology,
		service: new TransitMapNetworkService(catalogs, topology, {
			busConfigured: options.configured ?? true,
		}),
	};
}

describe("TransitMapNetworkService", () => {
	it("returns subway-only geometry below the live-bus zoom threshold", async () => {
		const { service, catalogs, topology } = createService();
		const network = await service.network({ ...eligibleQuery, zoom: 15 });

		expect(network.subway.lines.features.length).toBeGreaterThan(0);
		expect(network.bus).toMatchObject({
			enabled: false,
			reason: "zoom-required",
			routes: { features: [] },
			stops: { features: [] },
		});
		expect(catalogs.nearbyStops).not.toHaveBeenCalled();
		expect(topology.routesForStops).not.toHaveBeenCalled();
	});

	it("does not fan out bus requests for a viewport over four square kilometres", async () => {
		const { service, catalogs } = createService();
		const network = await service.network({
			west: 126.9,
			south: 37.4,
			east: 127.1,
			north: 37.6,
			zoom: 16,
		});

		expect(network.bus.reason).toBe("zoom-required");
		expect(catalogs.nearbyStops).not.toHaveBeenCalled();
	});

	it("reports unconfigured before attempting bus topology", async () => {
		const { service, catalogs, topology } = createService({ configured: false });
		const network = await service.network(eligibleQuery);

		expect(network.bus.reason).toBe("unconfigured");
		expect(catalogs.nearbyStops).not.toHaveBeenCalled();
		expect(topology.routesForStops).not.toHaveBeenCalled();
	});

	it("requires more zoom when over forty routes intersect the viewport", async () => {
		const { service } = createService({
			routes: Array.from({ length: 41 }, (_, index) => route(index + 1)),
		});
		const network = await service.network(eligibleQuery);

		expect(network.bus).toMatchObject({
			enabled: false,
			reason: "zoom-required",
			routes: { features: [] },
			stops: { features: [] },
		});
	});

	it("returns complete intersecting route paths and bbox-filtered stops", async () => {
		const { service, topology } = createService();
		const network = await service.network(eligibleQuery);

		expect(network.bus.enabled).toBe(true);
		expect(network.bus.reason).toBeUndefined();
		expect(network.bus.routes.features[0]).toMatchObject({
			properties: { routeId: "route-1", routeName: "노선 1" },
			geometry: { coordinates: route().path },
		});
		expect(network.bus.stops.features[0]).toMatchObject({
			properties: { stopId: "stop-1", routeIds: ["route-1"] },
			geometry: { coordinates: [127.11, 37.53] },
		});
		expect(topology.routesForStops).toHaveBeenCalledWith(["12345"]);
	});
});
