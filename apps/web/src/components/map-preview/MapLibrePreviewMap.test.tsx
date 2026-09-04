// @vitest-environment jsdom

import { StrictMode } from "react";
import type { TransitMapNetwork, TransitVehicle } from "@mota/contracts/transit-map";
import { act, render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MapLibrePreviewMap } from "./MapLibrePreviewMap";
import {
  failMapConstructionWith,
  installAnimationFrames,
  installResizeObserver,
  mapInstances,
  navigationControls,
  popupInstances,
  resetMapLibreRuntime,
  resizeObservers,
  workerUrls,
} from "./mapLibreTestRuntime";

vi.mock("maplibre-gl", async () => {
  const runtime = await import("./mapLibreTestRuntime");
  return {
    Map: runtime.MockMap,
    NavigationControl: runtime.MockNavigationControl,
    Popup: runtime.MockPopup,
    setWorkerUrl: runtime.setWorkerUrl,
  };
});

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

function train(coordinates: [number, number], capturedAt: string): TransitVehicle {
  return {
    id: "subway:1008:8120",
    mode: "subway",
    routeId: "1008",
    routeName: "8호선",
    coordinates,
    bearing: 90,
    direction: "암사행",
    capturedAt,
    positionBasis: "station-segment",
  };
}

function renderMap(overrides: Partial<React.ComponentProps<typeof MapLibrePreviewMap>> = {}) {
  const props = {
    onReady: vi.fn(),
    onFatal: vi.fn(),
    onDegraded: vi.fn(),
    onTransitSelect: vi.fn(),
    onViewportChange: vi.fn(),
    ...overrides,
  };
  return { ...render(<MapLibrePreviewMap {...props} />), props };
}

describe("MapLibrePreviewMap", () => {
  beforeEach(() => {
    resetMapLibreRuntime();
    vi.unstubAllGlobals();
    installResizeObserver();
  });

  it("removes the StrictMode probe instance and keeps one committed map", () => {
    const props = {
      onReady: vi.fn(),
      onFatal: vi.fn(),
      onDegraded: vi.fn(),
    };
    render(
      <StrictMode>
        <MapLibrePreviewMap {...props} />
      </StrictMode>,
    );

    expect(mapInstances).toHaveLength(2);
    expect(mapInstances[0]?.removed).toBe(true);
    expect(mapInstances[1]?.removed).toBe(false);
  });

  it("constructs an interactive Korean map with exact camera constraints", () => {
    renderMap();

    expect(workerUrls).toHaveLength(1);
    expect(workerUrls[0]).toMatch(/mapLibreWorker|maplibre-worker/i);
    expect(mapInstances[0]?.options).toEqual({
      container: expect.any(HTMLElement),
      style: "https://tiles.openfreemap.org/styles/liberty",
      center: [127.1253, 37.5366],
      zoom: 15,
      pitch: 42,
      bearing: -20,
      minZoom: 11,
      maxZoom: 19,
      minPitch: 0,
      maxPitch: 60,
      maxBounds: [
        [126.7, 37.3],
        [127.3, 37.8],
      ],
      roll: 0,
      rollEnabled: false,
      locale: {
        "NavigationControl.ZoomIn": "확대",
        "NavigationControl.ZoomOut": "축소",
        "NavigationControl.ResetBearing": "드래그하여 지도를 회전하고 클릭하여 북쪽으로 재설정",
      },
      reduceMotion: undefined,
      localIdeographFontFamily: '"Pretendard Variable", Pretendard, "Noto Sans KR", sans-serif',
      collectResourceTiming: false,
    });
    expect(navigationControls[0]?.options).toEqual({
      showZoom: true,
      showCompass: true,
      visualizePitch: true,
    });
  });

  it("reports ready only after load confirms the building layer", () => {
    const { getByTestId, props } = renderMap();

    act(() => mapInstances[0]?.emit("load"));

    expect(props.onReady).toHaveBeenCalledOnce();
    expect(getByTestId("maplibre-preview-map")).toHaveAttribute(
      "data-building-layer",
      "building-3d",
    );
    expect(getByTestId("maplibre-preview-map")).toHaveAttribute("data-center-lng", "127.125300");
    expect(getByTestId("maplibre-preview-map")).toHaveAttribute("data-zoom", "15.000");
  });

  it("reports the loaded viewport and installs bulk transit layers once", () => {
    const { props } = renderMap({ network });

    act(() => mapInstances[0]?.emit("load"));

    expect(props.onViewportChange).toHaveBeenCalledWith({
      west: 127.1153,
      south: 37.5266,
      east: 127.1353,
      north: 37.5466,
      zoom: 15,
    });
    expect(mapInstances[0]?.addSource).toHaveBeenCalledTimes(9);
    expect(mapInstances[0]?.addLayer).toHaveBeenCalledTimes(9);
  });

  it("interpolates changed vehicles and keeps one accessible selected popup", () => {
    const frames = installAnimationFrames();
    vi.spyOn(performance, "now").mockReturnValue(0);
    const first = train([127.1, 37.5], "2026-09-05T04:00:00.000Z");
    const next = train([127.102, 37.5], "2026-09-05T04:00:10.000Z");
    const result = renderMap({
      network: {
        ...network,
        subway: {
          ...network.subway,
          lines: {
            type: "FeatureCollection",
            features: [
              {
                type: "Feature",
                properties: { routeId: "8", routeName: "8호선", color: "#e6186c" },
                geometry: {
                  type: "LineString",
                  coordinates: [
                    [127.1, 37.5],
                    [127.102, 37.5],
                  ],
                },
              },
            ],
          },
        },
      },
      vehicles: { bus: [], subway: [first] },
    });
    act(() => mapInstances[0]?.emit("load"));

    result.rerender(
      <MapLibrePreviewMap
        {...result.props}
        vehicles={{ bus: [], subway: [next] }}
        selection={{
          key: next.id,
          mode: "subway",
          kind: "vehicle",
          name: next.routeName,
          detail: next.direction,
          coordinates: next.coordinates,
        }}
      />,
    );
    expect(frames.pending()).toBe(1);
    act(() => frames.flush(400));

    const data = mapInstances[0]?.sources.get("mota-subway-vehicles")?.setData.mock
      .lastCall?.[0] as {
      features?: Array<{ properties: { anchorLng: number; anchorLat: number; bearing: number } }>;
    };
    expect(data.features?.[0]?.properties.anchorLng).toBeCloseTo(127.101, 8);
    expect(data.features?.[0]?.properties.anchorLat).toBe(37.5);
    expect(data.features?.[0]?.properties.bearing).toBe(90);
    expect(popupInstances).toHaveLength(1);
    expect(popupInstances[0]?.content).toHaveTextContent("8호선");
    expect(popupInstances[0]?.content).toHaveAccessibleName("8호선 상세 정보");
    popupInstances[0]?.getElement().querySelector<HTMLButtonElement>("button")?.click();
    expect(result.props.onTransitSelect).toHaveBeenCalledWith(null);
  });

  it("preserves the observed direction when reduced motion skips animation", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    try {
      const first = { ...train([127.101, 37.5], "2026-09-05T04:00:00.000Z"), bearing: 270 };
      const routeNetwork: TransitMapNetwork = {
        ...network,
        subway: {
          ...network.subway,
          lines: {
            type: "FeatureCollection",
            features: [
              {
                type: "Feature",
                properties: { routeId: "8", routeName: "8호선", color: "#e6186c" },
                geometry: {
                  type: "LineString",
                  coordinates: [
                    [127.1, 37.5],
                    [127.102, 37.5],
                  ],
                },
              },
            ],
          },
        },
      };
      const result = renderMap({ network: routeNetwork, vehicles: { bus: [], subway: [first] } });
      act(() => mapInstances[0]?.emit("load"));
      const next = train([127.101, 37.5], "2026-09-05T04:00:10.000Z");
      result.rerender(
        <MapLibrePreviewMap {...result.props} vehicles={{ bus: [], subway: [next] }} />,
      );
      const data = mapInstances[0]?.sources.get("mota-subway-vehicles")?.setData.mock
        .lastCall?.[0] as { features: Array<{ properties: { bearing: number } }> };
      expect(data.features[0]?.properties.bearing).toBe(270);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("opens a selection made before the map finishes loading", () => {
    renderMap({
      selection: {
        key: "station",
        mode: "subway",
        kind: "station",
        name: "천호역",
        detail: "8호선",
        coordinates: [127.123, 37.538],
      },
    });
    expect(popupInstances).toHaveLength(0);
    act(() => mapInstances[0]?.emit("load"));
    expect(popupInstances).toHaveLength(1);
    expect(popupInstances[0]?.content).toHaveAccessibleName("천호역 상세 정보");
  });

  it("reports fatal and degraded map failures with typed reasons", () => {
    const missing = renderMap();
    if (mapInstances[0]) mapInstances[0].buildingLayer = undefined;
    act(() => mapInstances[0]?.emit("load"));
    expect(missing.props.onFatal).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "missing-building-layer",
        error: expect.any(Error),
      }),
    );
    missing.unmount();

    resetMapLibreRuntime();
    const styled = renderMap();
    const styleError = new Error("style JSON failed");
    act(() => mapInstances[0]?.emit("error", { error: styleError, style: {} }));
    expect(styled.props.onFatal).toHaveBeenCalledWith({
      kind: "style",
      error: styleError,
    });

    const tileError = new Error("tile failed");
    act(() => mapInstances[0]?.emit("error", { error: tileError, sourceId: "openmaptiles" }));
    expect(styled.props.onDegraded).toHaveBeenCalledWith({
      kind: "resource",
      error: tileError,
    });
  });

  it("reports constructor and WebGL context failures", () => {
    const constructionError = new Error("WebGL unavailable");
    failMapConstructionWith(constructionError);
    const constructed = renderMap();
    expect(constructed.props.onFatal).toHaveBeenCalledWith({
      kind: "construction",
      error: constructionError,
    });
    constructed.unmount();

    resetMapLibreRuntime();
    const context = renderMap();
    const webglError = new Error("WebGL context lost");
    act(() => mapInstances[0]?.emit("webglcontextlost", { error: webglError }));
    expect(context.props.onFatal).toHaveBeenCalledWith({
      kind: "webgl-context-lost",
      error: webglError,
    });
  });

  it("resizes, reports changed viewports, and cleans every map resource", () => {
    const { getByTestId, props, unmount } = renderMap({ network });
    const map = mapInstances[0];
    act(() => map?.emit("load"));
    expect(resizeObservers[0]?.observe).toHaveBeenCalledWith(getByTestId("maplibre-preview-map"));

    act(() => resizeObservers[0]?.callback([], {} as ResizeObserver));
    if (map) {
      map.center = { lat: 37.54, lng: 127.13 };
      map.zoom = 16;
    }
    act(() => map?.emit("moveend"));
    expect(props.onViewportChange).toHaveBeenLastCalledWith({
      west: 127.12,
      south: 37.53,
      east: 127.14,
      north: 37.55,
      zoom: 16,
    });

    unmount();
    expect(resizeObservers[0]?.disconnect).toHaveBeenCalledOnce();
    expect(map?.removeControl).toHaveBeenCalledWith(navigationControls[0]);
    expect(map?.listenerCount()).toBe(0);
    expect(map?.sources).toHaveProperty("size", 0);
    expect(map?.remove).toHaveBeenCalledOnce();
    act(() => map?.emit("load"));
    expect(props.onReady).toHaveBeenCalledOnce();
  });
});
