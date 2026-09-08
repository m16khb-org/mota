import { describe, expect, it, vi } from "vitest";
import type { TransitMapNetwork } from "@mota/contracts/transit-map";
import {
	MAP_PREVIEW_TRAIN_LOD_SWITCH_ZOOM,
	MAP_PREVIEW_ZOOM_LIMITS,
} from "./mapPreviewConfig";
import { createTransitMapLayers } from "./transitMapLayers";


const emptyCollection = { type: "FeatureCollection" as const, features: [] };
const route = {
	type: "Feature" as const,
	properties: { routeId: "8", routeName: "8호선", color: "#e6186c" },
	geometry: {
		type: "LineString" as const,
		coordinates: [
			[127.118, 37.532] as [number, number],
			[127.123, 37.538] as [number, number],
		],
	},
};
const station = {
	type: "Feature" as const,
	properties: { stationId: "8120", stationName: "천호역", routeIds: ["8호선"] },
	geometry: { type: "Point" as const, coordinates: [127.123, 37.538] as [number, number] },
};
const network = {
	revision: "revision-1",
	generatedAt: "2026-09-05T00:00:00.000Z",
	subway: {
		attribution: "© OpenStreetMap contributors, ODbL",
		lines: { type: "FeatureCollection" as const, features: [route] },
		stations: { type: "FeatureCollection" as const, features: [station] },
	},
} satisfies TransitMapNetwork;

type TestFeature = {
	geometry: { type: string; coordinates?: readonly [number, number] };
	properties: Record<string, unknown>;
};
type TestCollection = { features: TestFeature[] };

class MapDouble {
	readonly sources = new Map<string, { setData: ReturnType<typeof vi.fn> }>();
	readonly layers: Array<{ id: string; [key: string]: unknown }> = [];
	readonly listeners: Array<{
		type: string;
		layerId: string;
		listener: (event: object) => void;
	}> = [];
	readonly addSource = vi.fn((id: string) => {
		this.sources.set(id, { setData: vi.fn() });
	});
	readonly getSource = vi.fn((id: string) => this.sources.get(id));
	readonly removeSource = vi.fn((id: string) => this.sources.delete(id));
	readonly addLayer = vi.fn((layer: { id: string; [key: string]: unknown }) => {
		this.layers.push(layer);
	});
	readonly getLayer = vi.fn((id: string) => this.layers.find((layer) => layer.id === id));
	readonly removeLayer = vi.fn((id: string) => {
		const index = this.layers.findIndex((layer) => layer.id === id);
		if (index >= 0) this.layers.splice(index, 1);
	});
	readonly on = vi.fn((type: string, layerId: string, listener: (event: object) => void) => {
		this.listeners.push({ type, layerId, listener });
	});
	readonly off = vi.fn();
	emit(type: string, layerId: string, event: object) {
		for (const registered of this.listeners) {
			if (registered.type === type && registered.layerId === layerId) registered.listener(event);
		}
	}
}

const train = {
	id: "subway:8:8120",
	mode: "subway" as const,
	routeId: "8",
	routeName: "8호선",
	coordinates: [127.12, 37.534] as [number, number],
	bearing: 35,
	direction: "암사행",
	capturedAt: "2026-09-05T04:00:00.000Z",
	positionBasis: "station-segment" as const,
};

function data(map: MapDouble, sourceId: string) {
	return map.sources.get(sourceId)?.setData.mock.lastCall?.[0] as TestCollection;
}

describe("subway-only transit map layer manager", () => {
	it("registers only subway sources and complementary far/near vehicle layers", () => {
		const map = new MapDouble();
		createTransitMapLayers(map, vi.fn());

		expect(map.addSource.mock.calls.map(([id]) => id)).toEqual([
			"mota-subway-lines",
			"mota-subway-stations",
			"mota-subway-vehicles",
			"mota-transit-selection",
			"mota-subway-stations-3d",
			"mota-subway-vehicles-3d",
		]);
		expect(map.layers.map(({ id }) => id)).toEqual([
			"mota-subway-lines",
			"mota-subway-stations",
			"mota-subway-station-labels",
			"mota-subway-vehicles",
			"mota-subway-vehicles-3d",
			"mota-transit-selection",
		]);
		expect(map.layers.some(({ id }) => id.includes("bus"))).toBe(false);

		const far = map.layers.find(({ id }) => id === "mota-subway-vehicles");
		const near = map.layers.find(({ id }) => id === "mota-subway-vehicles-3d");
		expect(far).toMatchObject({
			type: "circle",
			source: "mota-subway-vehicles",
			maxzoom: MAP_PREVIEW_TRAIN_LOD_SWITCH_ZOOM,
		});
		expect(near).toMatchObject({
			type: "fill-extrusion",
			source: "mota-subway-vehicles-3d",
			minzoom: MAP_PREVIEW_TRAIN_LOD_SWITCH_ZOOM,
		});

		// The far circle must meet the model at the handoff: its radius stops end
		// at the switch zoom with a radius matching the ~16px projected train,
		// and never fall below readable at the minimum zoom.
		const radius = (
			far?.paint as Record<string, unknown> | undefined
		)?.["circle-radius"] as unknown[];
		expect(radius).toEqual([
			"interpolate",
			["linear"],
			["zoom"],
			MAP_PREVIEW_ZOOM_LIMITS.min,
			6.5,
			MAP_PREVIEW_TRAIN_LOD_SWITCH_ZOOM,
			8,
		]);
	});

	it("writes the same observed train to a readable colored point and detailed model", () => {
		const map = new MapDouble();
		const layers = createTransitMapLayers(map, vi.fn());

		layers.setNetwork(network);
		layers.setVehicles([train]);

		const far = data(map, "mota-subway-vehicles");
		const near = data(map, "mota-subway-vehicles-3d");
		expect(far.features).toHaveLength(1);
		expect(far.features[0]?.geometry).toEqual({ type: "Point", coordinates: train.coordinates });
		expect(far.features[0]?.properties.color).toBe("#e6186c");
		expect(near.features).toHaveLength(29);
		expect(near.features.every((feature) => feature.geometry.type === "Polygon")).toBe(true);
		expect(near.features[0]?.properties.anchorLng).toBe(train.coordinates[0]);
		expect(
		near.features.find((feature) => feature.properties.part === "car-2-stripe")?.properties.color,
	).toBe("#e6186c");
	});

	it("keeps station and both train LODs selectable without bus hit targets", () => {
		const map = new MapDouble();
		const onSelect = vi.fn();
		const layers = createTransitMapLayers(map, onSelect);
		layers.setNetwork(network);
		layers.setVehicles([train]);

		const stationModel = data(map, "mota-subway-stations-3d").features[0];
		const farTrain = data(map, "mota-subway-vehicles").features[0];
		const nearTrain = data(map, "mota-subway-vehicles-3d").features.find(
			(feature) => feature.properties.part === "front-cab",
		);
		if (!stationModel || !farTrain || !nearTrain) throw new Error("Missing selectable fixture");

		map.emit("click", "mota-subway-stations", { features: [stationModel] });
		map.emit("click", "mota-subway-vehicles", { features: [farTrain] });
		map.emit("click", "mota-subway-vehicles-3d", { features: [nearTrain] });

		expect(onSelect).toHaveBeenNthCalledWith(
			1,
			expect.objectContaining({ key: "8120", kind: "station", mode: "subway" }),
		);
		expect(onSelect).toHaveBeenNthCalledWith(
			2,
			expect.objectContaining({ key: train.id, kind: "vehicle", mode: "subway" }),
		);
		expect(onSelect).toHaveBeenNthCalledWith(
			3,
			expect.objectContaining({ key: train.id, kind: "vehicle", mode: "subway" }),
		);
		expect(map.listeners.map(({ layerId }) => layerId)).toEqual([
			"mota-subway-stations",
			"mota-subway-vehicles",
			"mota-subway-vehicles-3d",
		]);
	});

	it("clears vehicle geometry on an empty snapshot and tears down every subway resource", () => {
		const map = new MapDouble();
		const layers = createTransitMapLayers(map, vi.fn());

		layers.setVehicles([train]);
		layers.setVehicles([]);
		expect(data(map, "mota-subway-vehicles")).toEqual(emptyCollection);
		expect(data(map, "mota-subway-vehicles-3d")).toEqual(emptyCollection);

		layers.destroy();
		layers.destroy();
		expect(map.off).toHaveBeenCalled();
		expect(map.removeLayer).toHaveBeenCalledTimes(6);
		expect(map.removeSource).toHaveBeenCalledTimes(6);
	});
});
