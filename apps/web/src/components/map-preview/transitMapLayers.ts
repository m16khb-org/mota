import type { TransitMapNetwork, TransitVehicle } from "@mota/contracts/transit-map";
import { staticModels, vehicleModels } from "./transitModels";

const SOURCE_IDS = [
  "mota-subway-lines",
  "mota-bus-lines",
  "mota-subway-stations",
  "mota-bus-stops",
  "mota-subway-vehicles",
  "mota-bus-vehicles",
  "mota-transit-selection",
  "mota-subway-stations-3d",
  "mota-bus-stops-3d",
] as const;

const LAYER_IDS = [
  "mota-subway-lines",
  "mota-bus-lines",
  "mota-subway-stations",
  "mota-subway-station-labels",
  "mota-bus-stops",
  "mota-bus-stop-labels",
  "mota-subway-vehicles",
  "mota-bus-vehicles",
  "mota-transit-selection",
] as const;

const SELECTABLE_LAYERS = [
  "mota-subway-stations",
  "mota-bus-stops",
  "mota-subway-vehicles",
  "mota-bus-vehicles",
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
  readonly mode: "bus" | "subway";
  readonly kind: "route" | "stop" | "station" | "vehicle";
  readonly name: string;
  readonly detail: string;
  readonly coordinates: readonly [number, number];
}

export interface TransitMapLayers {
  setNetwork(network: TransitMapNetwork): void;
  setVehicles(vehicles: {
    readonly bus: readonly TransitVehicle[];
    readonly subway: readonly TransitVehicle[];
  }): void;
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
      const feature = event.features?.[0];
      const selection = selectionFromFeature(feature);
      if (selection) onSelect(selection);
    };
    clickListeners.set(layerId, listener);
    map.on("click", layerId, listener);
  }

  let destroyed = false;
  return {
    setNetwork(network) {
      setData(map, "mota-subway-lines", network.subway.lines);
      setData(map, "mota-bus-lines", network.bus.routes);
      setData(map, "mota-subway-stations", network.subway.stations);
      setData(map, "mota-bus-stops", network.bus.stops);
      setData(
        map,
        "mota-subway-stations-3d",
        staticModels(network.subway.stations.features, network.subway.lines, "station"),
      );
      setData(
        map,
        "mota-bus-stops-3d",
        staticModels(network.bus.stops.features, network.bus.routes, "stop"),
      );
    },
    setVehicles(vehicles) {
      setData(map, "mota-subway-vehicles", vehicleModels(vehicles.subway));
      setData(map, "mota-bus-vehicles", vehicleModels(vehicles.bus));
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
  if (!feature?.properties) {
    return null;
  }
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
  const mode = properties.mode === "bus" || "stopId" in properties ? "bus" : "subway";
  const kind = "stopId" in properties ? "stop" : "stationId" in properties ? "station" : "vehicle";
  const key = String(properties.id ?? properties.stopId ?? properties.stationId ?? "selection");
  const name = String(
    properties.routeName ?? properties.stopName ?? properties.stationName ?? "대중교통 지점",
  );
  const detail = Array.isArray(properties.routeIds)
    ? properties.routeIds.join(" · ")
    : String(properties.direction ?? properties.arsId ?? "");
  return {
    key,
    mode,
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
      id: "mota-bus-lines",
      type: "line",
      source: "mota-bus-lines",
      paint: { "line-color": ["get", "color"], "line-width": 3, "line-opacity": 0.7 },
    },
    extrusionLayer("mota-subway-stations", "mota-subway-stations-3d"),
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
    extrusionLayer("mota-bus-stops", "mota-bus-stops-3d"),
    {
      id: "mota-bus-stop-labels",
      type: "symbol",
      source: "mota-bus-stops",
      minzoom: 16,
      layout: {
        "text-field": ["get", "stopName"],
        "text-size": ["interpolate", ["linear"], ["zoom"], 16, 10, 19, 12],
        "text-offset": [0, 1.1],
        "text-anchor": "top",
      },
      paint: {
        "text-color": "#111111",
        "text-halo-color": "#ffffff",
        "text-halo-width": 2,
      },
    },
    extrusionLayer("mota-subway-vehicles", "mota-subway-vehicles"),
    extrusionLayer("mota-bus-vehicles", "mota-bus-vehicles"),
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

function extrusionLayer(id: string, source: string) {
  return {
    id,
    source,
    type: "fill-extrusion",
    paint: {
      "fill-extrusion-color": ["get", "color"],
      "fill-extrusion-base": ["get", "base"],
      "fill-extrusion-height": ["get", "height"],
      "fill-extrusion-opacity": 1,
    },
  };
}
