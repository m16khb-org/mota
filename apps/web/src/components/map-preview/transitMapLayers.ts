import type {
	SubwayVehicle,
	TransitMapNetwork,
} from "@mota/contracts/transit-map";
import {
	MAP_PREVIEW_TRAIN_LOD_SWITCH_ZOOM,
	MAP_PREVIEW_ZOOM_LIMITS,
} from "./mapPreviewConfig";
import { vehicleModels, vehiclePoints } from "./transitModels";

const SOURCE_IDS = [
	"mota-subway-lines",
	"mota-subway-stations",
	"mota-subway-vehicles",
	"mota-transit-selection",
	"mota-subway-vehicles-3d",
] as const;

const LAYER_IDS = [
	"mota-subway-lines",
	"mota-subway-stations",
	"mota-subway-station-labels",
	"mota-subway-vehicles",
	"mota-subway-vehicles-3d",
	"mota-transit-selection",
] as const;

const SELECTABLE_LAYERS = [
	"mota-subway-stations",
	"mota-subway-vehicles",
	"mota-subway-vehicles-3d",
] as const;

const emptyCollection = () => ({
	type: "FeatureCollection" as const,
	features: [],
});

interface GeoJsonSourceLike {
	setData(data: object): void;
}

export interface TransitMapLike {
	addSource(id: string, source: object): void;
	getSource(id: string): GeoJsonSourceLike | undefined;
	removeSource(id: string): void;
	addLayer(layer: object): void;
	getLayer(id: string): object | undefined;
	removeLayer(id: string): void;
	on(type: string, layerId: string, listener: (event: MapLayerEvent) => void): void;
	off(type: string, layerId: string, listener: (event: MapLayerEvent) => void): void;
}

interface SelectableMapFeature {
	readonly properties?: Record<string, unknown> | null;
	readonly geometry?: {
		readonly type?: string;
		readonly coordinates?: unknown;
	};
}

interface MapLayerEvent {
	readonly features?: readonly SelectableMapFeature[];
}

export interface TransitMapSelection {
	readonly key: string;
	readonly mode: "subway";
	readonly kind: "station" | "vehicle";
	readonly name: string;
	readonly detail: string;
	readonly coordinates: readonly [number, number];
}

export interface TransitMapLayers {
	setNetwork(network: TransitMapNetwork): void;
	setVehicles(vehicles: readonly SubwayVehicle[]): void;
	setSelection(selection: TransitMapSelection | null): void;
	destroy(): void;
}

export function createTransitMapLayers(
	map: TransitMapLike,
	onSelect: (selection: TransitMapSelection) => void,
): TransitMapLayers {
	for (const id of SOURCE_IDS) {
		if (!map.getSource(id)) {
			map.addSource(id, { type: "geojson", data: emptyCollection() });
		}
	}
	for (const layer of layerDefinitions()) {
		if (!map.getLayer(layer.id)) map.addLayer(layer);
	}

	const clickListeners = new Map<string, (event: MapLayerEvent) => void>();
	for (const layerId of SELECTABLE_LAYERS) {
		const listener = (event: MapLayerEvent) => {
			const selection = selectionFromFeature(event.features?.[0]);
			if (selection) onSelect(selection);
		};
		clickListeners.set(layerId, listener);
		map.on("click", layerId, listener);
	}

	let currentNetwork: TransitMapNetwork | null = null;
	let currentSubwayVehicles: readonly SubwayVehicle[] = [];
	let destroyed = false;

	function renderVehicles() {
		const routes = currentNetwork?.subway.lines;
		setData(map, "mota-subway-vehicles", vehiclePoints(currentSubwayVehicles, routes));
		setData(map, "mota-subway-vehicles-3d", vehicleModels(currentSubwayVehicles, routes));
	}

	return {
		setNetwork(network) {
			currentNetwork = network;
			setData(map, "mota-subway-lines", network.subway.lines);
			setData(map, "mota-subway-stations", network.subway.stations);
			renderVehicles();
		},
		setVehicles(vehicles) {
			currentSubwayVehicles = vehicles;
			renderVehicles();
		},
		setSelection(selection) {
			setData(
				map,
				"mota-transit-selection",
				selection
					? {
							type: "FeatureCollection",
							features: [
								{
									type: "Feature",
									properties: selection,
									geometry: {
										type: "Point",
										coordinates: selection.coordinates,
									},
								},
							],
						}
					: emptyCollection(),
			);
		},
		destroy() {
			if (destroyed) return;
			destroyed = true;
			for (const [layerId, listener] of clickListeners) {
				map.off("click", layerId, listener);
			}
			for (const id of [...LAYER_IDS].reverse()) {
				if (map.getLayer(id)) map.removeLayer(id);
			}
			for (const id of [...SOURCE_IDS].reverse()) {
				if (map.getSource(id)) map.removeSource(id);
			}
		},
	};
}

function setData(map: TransitMapLike, sourceId: string, data: object) {
	map.getSource(sourceId)?.setData(data);
}

function selectionFromFeature(
	feature: SelectableMapFeature | undefined,
): TransitMapSelection | null {
	if (!feature?.properties) return null;
	const coordinates =
		feature.geometry?.type === "Point"
			? feature.geometry.coordinates
			: [feature.properties.anchorLng, feature.properties.anchorLat];
	if (
		!Array.isArray(coordinates) ||
		typeof coordinates[0] !== "number" ||
		typeof coordinates[1] !== "number"
	) {
		return null;
	}
	const properties = feature.properties;
	const kind = "stationId" in properties ? "station" : "vehicle";
	const key = String(properties.id ?? properties.stationId ?? "selection");
	const name = String(
		properties.routeName ?? properties.stationName ?? "지하철 지점",
	);
	const detail = Array.isArray(properties.routeIds)
		? properties.routeIds.join(" · ")
		: String(properties.direction ?? "");
	return {
		key,
		mode: "subway" as const,
		kind,
		name,
		detail,
		coordinates: [coordinates[0], coordinates[1]],
	};
}

function layerDefinitions() {
	return [
		{
			id: "mota-subway-lines",
			type: "line",
			source: "mota-subway-lines",
			paint: {
				"line-color": ["get", "color"],
				"line-width": ["interpolate", ["linear"], ["zoom"], 11, 2, 17, 6],
				"line-opacity": 0.82,
			},
		},
		{
			id: "mota-subway-stations",
			type: "circle",
			source: "mota-subway-stations",
			paint: {
				// Stations stay as a small, neutral point at every zoom. Unlike the
				// line-colored vehicle circle, its dark outline and white fill make
				// the map location unambiguous without reading as a train model.
				"circle-radius": ["interpolate", ["linear"], ["zoom"], 11, 4, 19, 7],
				"circle-color": "#f7f7f3",
				"circle-opacity": 0.98,
				"circle-stroke-color": "#111111",
				"circle-stroke-width": 2,
			},
		},
		{
			id: "mota-subway-station-labels",
			type: "symbol",
			source: "mota-subway-stations",
			minzoom: 13,
			layout: {
				"text-field": ["get", "stationName"],
				"text-size": ["interpolate", ["linear"], ["zoom"], 13, 10, 17, 13],
				"text-offset": [0, 1.1],
				"text-anchor": "top",
			},
			paint: {
				"text-color": "#111111",
				"text-halo-color": "#ffffff",
				"text-halo-width": 2,
			},
		},
		{
			id: "mota-subway-vehicles",
			type: "circle",
			source: "mota-subway-vehicles",
			maxzoom: MAP_PREVIEW_TRAIN_LOD_SWITCH_ZOOM,
			paint: {
				"circle-color": ["get", "color"],
				// Sized to the handoff: 8px radius at the switch matches the ~16px a
				// 31m train projects there, so the LOD change swaps representations
				// without a size jump. Never below 6.5px so it stays readable at the
				// minimum zoom.
				"circle-radius": [
					"interpolate",
					["linear"],
					["zoom"],
					MAP_PREVIEW_ZOOM_LIMITS.min,
					6.5,
					MAP_PREVIEW_TRAIN_LOD_SWITCH_ZOOM,
					8,
				],
				"circle-opacity": 0.96,
				"circle-stroke-color": "#ffffff",
				"circle-stroke-width": 2,
			},
		},
		extrusionLayer(
			"mota-subway-vehicles-3d",
			"mota-subway-vehicles-3d",
			MAP_PREVIEW_TRAIN_LOD_SWITCH_ZOOM,
		),
		{
			id: "mota-transit-selection",
			type: "circle",
			source: "mota-transit-selection",
			paint: {
				"circle-radius": 13,
				"circle-color": "#d7ff43",
				"circle-opacity": 0.35,
				"circle-stroke-color": "#111111",
				"circle-stroke-width": 3,
			},
		},
	];
}

function extrusionLayer(id: string, source: string, minzoom?: number) {
	return {
		id,
		source,
		type: "fill-extrusion",
		...(minzoom === undefined ? {} : { minzoom }),
		paint: {
			"fill-extrusion-color": ["get", "color"],
			"fill-extrusion-base": ["get", "base"],
			"fill-extrusion-height": ["get", "height"],
			"fill-extrusion-opacity": 1,
		},
	};
}
