import { describe, expect, it, vi } from "vitest";
import type { TransitMapNetwork } from "@mota/contracts/transit-map";
import { createTransitMapLayers } from "./transitMapLayers";

const emptyCollection = { type: "FeatureCollection" as const, features: [] };
const network = {
  revision: "revision-1",
  generatedAt: "2026-09-05T00:00:00.000Z",
  subway: {
    attribution: "© OpenStreetMap contributors, ODbL",
    lines: emptyCollection,
    stations: emptyCollection,
  },
  bus: {
    enabled: true,
    attribution: "서울특별시 교통정보",
    routes: emptyCollection,
    stops: emptyCollection,
  },
} satisfies TransitMapNetwork;

class MapDouble {
  readonly sources = new Map<string, { setData: ReturnType<typeof vi.fn> }>();
  readonly layers: string[] = [];
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
  readonly addLayer = vi.fn((layer: { id: string }) => this.layers.push(layer.id));
  readonly getLayer = vi.fn((id: string) => (this.layers.includes(id) ? { id } : undefined));
  readonly removeLayer = vi.fn((id: string) => {
    this.layers.splice(this.layers.indexOf(id), 1);
  });
  readonly on = vi.fn((type: string, layerId: string, listener: (event: object) => void) => {
    this.listeners.push({ type, layerId, listener });
  });
  readonly off = vi.fn();
  emit(type: string, layerId: string, event: object) {
    for (const registered of this.listeners) {
      if (registered.type === type && registered.layerId === layerId) {
        registered.listener(event);
      }
    }
  }
}

describe("transit map layer manager", () => {
  it("renders every transit object as georeferenced solid geometry with selectable anchors", () => {
    const map = new MapDouble();
    const onSelect = vi.fn();
    const layers = createTransitMapLayers(map, onSelect);
    layers.setNetwork({
      ...network,
      subway: {
        ...network.subway,
        stations: {
          type: "FeatureCollection",
          features: [
            {
              type: "Feature",
              properties: { stationId: "8120", stationName: "천호역", routeIds: ["8"] },
              geometry: { type: "Point", coordinates: [127.123, 37.538] },
            },
          ],
        },
      },
      bus: {
        ...network.bus,
        stops: {
          type: "FeatureCollection",
          features: [
            {
              type: "Feature",
              properties: { stopId: "stop-a", stopName: "정류장", arsId: "25014", routeIds: [] },
              geometry: { type: "Point", coordinates: [127.125, 37.537] },
            },
          ],
        },
      },
    });
    layers.setVehicles({
      subway: [
        {
          id: "train",
          mode: "subway",
          routeId: "8",
          routeName: "8호선",
          coordinates: [127.12, 37.534],
          bearing: 90,
          direction: "상행",
          capturedAt: "2026-09-05T04:00:00.000Z",
          positionBasis: "station-segment",
        },
      ],
      bus: [
        {
          id: "bus",
          mode: "bus",
          routeId: "341",
          routeName: "341",
          coordinates: [127.124, 37.536],
          bearing: 0,
          direction: "강남",
          capturedAt: "2026-09-05T04:00:00.000Z",
          positionBasis: "gps",
        },
      ],
    });
    for (const id of [
      "mota-subway-stations",
      "mota-bus-stops",
      "mota-subway-vehicles",
      "mota-bus-vehicles",
    ]) {
      const layer = map.addLayer.mock.calls
        .map(([value]) => value)
        .find((value) => value.id === id);
      expect(layer).toMatchObject({ type: "fill-extrusion" });
      const source = map.sources.get(`${id}-3d`) ?? map.sources.get(id);
      const features = source?.setData.mock.lastCall?.[0].features;
      expect(features.length).toBeGreaterThan(2);
      for (const feature of features) {
        expect(feature.geometry.type).toBe("Polygon");
        expect(feature.properties.height).toBeGreaterThan(feature.properties.base);
        expect(feature.geometry.coordinates[0]).toHaveLength(5);
      }
    }
    const station =
      map.sources.get("mota-subway-stations-3d")?.setData.mock.lastCall?.[0].features[0];
    map.emit("click", "mota-subway-stations", { features: [station] });
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ key: "8120", coordinates: [127.123, 37.538] }),
    );
  });
  it("registers the approved sources and layers once in stable order", () => {
    const map = new MapDouble();
    const layers = createTransitMapLayers(map, vi.fn());

    expect(map.addSource.mock.calls.map(([id]) => id)).toEqual([
      "mota-subway-lines",
      "mota-bus-lines",
      "mota-subway-stations",
      "mota-bus-stops",
      "mota-subway-vehicles",
      "mota-bus-vehicles",
      "mota-transit-selection",
      "mota-subway-stations-3d",
      "mota-bus-stops-3d",
    ]);
    expect(map.layers).toEqual([
      "mota-subway-lines",
      "mota-bus-lines",
      "mota-subway-stations",
      "mota-subway-station-labels",
      "mota-bus-stops",
      "mota-bus-stop-labels",
      "mota-subway-vehicles",
      "mota-bus-vehicles",
      "mota-transit-selection",
    ]);

    layers.setNetwork(network);
    layers.setNetwork(network);
    expect(map.addSource).toHaveBeenCalledTimes(9);
    expect(map.addLayer).toHaveBeenCalledTimes(9);
  });

  it("atomically replaces both vehicle sources including empty snapshots", () => {
    const map = new MapDouble();
    const layers = createTransitMapLayers(map, vi.fn());
    const vehicle = {
      id: "subway:1008:8120",
      mode: "subway" as const,
      routeId: "1008",
      routeName: "8호선",
      coordinates: [127.11, 37.53] as [number, number],
      bearing: 0,
      direction: "상행",
      capturedAt: "2026-09-05T04:00:00.000Z",
      positionBasis: "station-segment" as const,
    };

    layers.setVehicles({ subway: [vehicle], bus: [] });
    layers.setVehicles({ subway: [], bus: [] });

    expect(map.sources.get("mota-subway-vehicles")?.setData).toHaveBeenCalledTimes(2);
    expect(map.sources.get("mota-bus-vehicles")?.setData).toHaveBeenCalledTimes(2);
    expect(map.sources.get("mota-subway-vehicles")?.setData.mock.lastCall?.[0]).toEqual(
      emptyCollection,
    );
  });

  it("maps a clicked GeoJSON feature to one synchronized selection", () => {
    const map = new MapDouble();
    const onSelect = vi.fn();
    createTransitMapLayers(map, onSelect);

    map.emit("click", "mota-subway-stations", {
      features: [
        {
          properties: {
            stationId: "8120",
            stationName: "천호역",
            routeIds: ["8호선"],
          },
          geometry: { type: "Point", coordinates: [127.123, 37.538] },
        },
      ],
    });

    expect(onSelect).toHaveBeenCalledOnce();
    expect(onSelect).toHaveBeenCalledWith({
      key: "8120",
      mode: "subway",
      kind: "station",
      name: "천호역",
      detail: "8호선",
      coordinates: [127.123, 37.538],
    });
  });

  it("removes listeners, layers, and sources on destroy", () => {
    const map = new MapDouble();
    const layers = createTransitMapLayers(map, vi.fn());

    layers.destroy();
    layers.destroy();

    expect(map.off).toHaveBeenCalled();
    expect(map.removeLayer).toHaveBeenCalledTimes(9);
    expect(map.removeSource).toHaveBeenCalledTimes(9);
  });
});
