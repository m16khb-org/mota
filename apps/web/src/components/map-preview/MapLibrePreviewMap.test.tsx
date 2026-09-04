// @vitest-environment jsdom

import { StrictMode } from "react";
import { act, render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  failMapConstructionWith,
  installAnimationFrames,
  installResizeObserver,
  mapInstances,
  markerInstances,
  navigationControls,
  popupInstances,
  resetMapLibreRuntime,
  resizeObservers,
  workerUrls,
} from "./mapLibreTestRuntime";
import { busStopSchema } from "../../domain/bus";
import { mapPreviewPoints } from "./mapPreviewPoints";
import { MapLibrePreviewMap } from "./MapLibrePreviewMap";

vi.mock("maplibre-gl", async () => {
  const runtime = await import("./mapLibreTestRuntime");
  return {
    Map: runtime.MockMap,
    Marker: runtime.MockMarker,
    NavigationControl: runtime.MockNavigationControl,
    Popup: runtime.MockPopup,
    setWorkerUrl: runtime.setWorkerUrl,
  };
});

const initialCenter = { lat: 37.5366, lng: 127.1253 };

function renderMap(overrides: Partial<React.ComponentProps<typeof MapLibrePreviewMap>> = {}) {
  const props = {
    center: initialCenter,
    onReady: vi.fn(),
    onCenterChange: vi.fn(),
    onFatal: vi.fn(),
    onDegraded: vi.fn(),
    points: [],
    activePointKey: null,
    onActivePointChange: vi.fn(),
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
      center: initialCenter,
      onReady: vi.fn(),
      onCenterChange: vi.fn(),
      onFatal: vi.fn(),
      onDegraded: vi.fn(),
      points: [],
      activePointKey: null,
      onActivePointChange: vi.fn(),
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

  it("constructs an interactive Korean map with the exact camera constraints and control", () => {
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
    expect(mapInstances[0]?.options).not.toHaveProperty("transformRequest");
    expect(navigationControls[0]?.options).toEqual({
      showZoom: true,
      showCompass: true,
      visualizePitch: true,
    });
    expect(mapInstances[0]?.addControl).toHaveBeenCalledWith(navigationControls[0], "top-right");
  });

  it("reports ready only after load confirms Liberty building-3d", () => {
    const { getByTestId, props } = renderMap();
    expect(props.onReady).not.toHaveBeenCalled();

    act(() => mapInstances[0]?.emit("load"));

    expect(props.onReady).toHaveBeenCalledTimes(1);
    expect(props.onFatal).not.toHaveBeenCalled();
    expect(getByTestId("maplibre-preview-map")).toHaveAttribute("data-map-ready", "true");
    expect(getByTestId("maplibre-preview-map")).toHaveAttribute(
      "data-building-layer",
      "building-3d",
    );
    expect(getByTestId("maplibre-preview-map")).toHaveAttribute("data-center-lng", "127.125300");
    expect(getByTestId("maplibre-preview-map")).toHaveAttribute("data-center-lat", "37.536600");
    expect(getByTestId("maplibre-preview-map")).toHaveAttribute("data-zoom", "15.000");
    expect(getByTestId("maplibre-preview-map")).toHaveAttribute("data-pitch", "42.000");
    expect(getByTestId("maplibre-preview-map")).toHaveAttribute("data-bearing", "-20.000");
  });

  it("reports a typed fatal error when Liberty omits building-3d", () => {
    const { props } = renderMap();
    if (mapInstances[0]) mapInstances[0].buildingLayer = undefined;

    act(() => mapInstances[0]?.emit("load"));

    expect(props.onReady).not.toHaveBeenCalled();
    expect(props.onFatal).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "missing-building-layer", error: expect.any(Error) }),
    );
  });

  it("resizes for element-level container changes", () => {
    const { getByTestId } = renderMap();
    expect(resizeObservers[0]?.observe).toHaveBeenCalledWith(getByTestId("maplibre-preview-map"));

    act(() => resizeObservers[0]?.callback([], {} as ResizeObserver));

    expect(mapInstances[0]?.resize).toHaveBeenCalledTimes(1);
  });

  it("emits only six-decimal-distinct centers and ignores zoom, pitch, or bearing moveend", () => {
    const frames = installAnimationFrames();
    const { props } = renderMap();

    act(() => mapInstances[0]?.emit("moveend"));
    expect(frames.pending()).toBe(0);

    if (mapInstances[0]) {
      mapInstances[0].center = { lat: 37.5366004, lng: 127.1253004 };
    }
    act(() => mapInstances[0]?.emit("moveend"));
    expect(frames.pending()).toBe(0);

    if (mapInstances[0]) {
      mapInstances[0].center = { lat: 37.536601, lng: 127.125301 };
    }
    act(() => mapInstances[0]?.emit("moveend"));
    act(() => frames.flush());

    expect(props.onCenterChange).toHaveBeenCalledOnce();
    expect(props.onCenterChange).toHaveBeenCalledWith({
      lat: 37.536601,
      lng: 127.125301,
    });
  });

  it("coalesces rapid changed centers into the latest value for one frame", () => {
    const frames = installAnimationFrames();
    const { props } = renderMap();
    if (mapInstances[0]) {
      mapInstances[0].center = { lat: 37.536601, lng: 127.125301 };
      mapInstances[0].emit("moveend");
      mapInstances[0].center = { lat: 37.536602, lng: 127.125302 };
      mapInstances[0].emit("moveend");
    }

    expect(frames.pending()).toBe(1);
    act(() => frames.flush());
    expect(props.onCenterChange).toHaveBeenCalledOnce();
    expect(props.onCenterChange).toHaveBeenCalledWith({
      lat: 37.536602,
      lng: 127.125302,
    });
  });

  it("jumps non-animated to external center changes without echo", () => {
    const frames = installAnimationFrames();
    const { props, rerender } = renderMap();

    rerender(<MapLibrePreviewMap {...props} center={{ lat: 37.55, lng: 127.14 }} />);

    expect(mapInstances[0]?.jumpTo).toHaveBeenCalledWith({ center: [127.14, 37.55] });
    expect(frames.pending()).toBe(0);
    expect(props.onCenterChange).not.toHaveBeenCalled();
  });

  it("reports constructor and pre-load style errors as typed fatal failures", () => {
    const constructionError = new Error("WebGL unavailable");
    failMapConstructionWith(constructionError);
    const constructed = renderMap();
    expect(constructed.props.onFatal).toHaveBeenCalledWith({
      kind: "construction",
      error: constructionError,
    });
    constructed.unmount();

    resetMapLibreRuntime();
    const styled = renderMap();
    const styleError = new Error("style JSON failed");
    act(() => mapInstances[0]?.emit("error", { error: styleError, style: {} }));
    expect(styled.props.onFatal).toHaveBeenCalledWith({
      kind: "style",
      error: styleError,
    });
  });

  it("reports WebGL context loss as fatal and resource errors as degraded without removal", () => {
    const { props } = renderMap();
    const webglError = new Error("WebGL context lost");
    act(() => mapInstances[0]?.emit("webglcontextlost", { error: webglError }));
    expect(props.onFatal).toHaveBeenCalledWith({
      kind: "webgl-context-lost",
      error: webglError,
    });

    const tileError = new Error("tile 14/1/2 failed");
    act(() => mapInstances[0]?.emit("error", { error: tileError, sourceId: "openmaptiles" }));
    expect(props.onDegraded).toHaveBeenCalledWith({
      kind: "resource",
      error: tileError,
    });
    expect(mapInstances[0]?.removed).toBe(false);
  });

  it("keeps metadata-free style errors fatal after the initial load", () => {
    const { props } = renderMap();
    act(() => mapInstances[0]?.emit("load"));

    const styleError = new Error("late style failure");
    act(() => mapInstances[0]?.emit("error", { error: styleError }));

    expect(props.onFatal).toHaveBeenCalledWith({
      kind: "style",
      error: styleError,
    });
    expect(props.onDegraded).not.toHaveBeenCalled();
  });

  it("cleans listeners, observer, control, map, and a queued center frame", () => {
    const frames = installAnimationFrames();
    const { props, unmount } = renderMap();
    const map = mapInstances[0];
    if (map) {
      map.center = { lat: 37.54, lng: 127.13 };
      map.emit("moveend");
    }
    expect(frames.pending()).toBe(1);

    unmount();

    expect(frames.pending()).toBe(0);
    expect(resizeObservers[0]?.disconnect).toHaveBeenCalledOnce();
    expect(map?.removeControl).toHaveBeenCalledWith(navigationControls[0]);
    expect(map?.listenerCount()).toBe(0);
    expect(map?.remove).toHaveBeenCalledOnce();
    act(() => {
      map?.emit("load");
      map?.emit("moveend");
      map?.emit("error", { error: new Error("late"), sourceId: "source" });
      frames.flush();
    });
    expect(props.onReady).not.toHaveBeenCalled();
    expect(props.onCenterChange).not.toHaveBeenCalled();
    expect(props.onDegraded).not.toHaveBeenCalled();
  });

  it("reconciles controlled point details through the committed map and destroys them on unmount", () => {
    const bus = busStopSchema.parse({
      id: "same",
      arsId: "25014",
      name: "천호역",
      lat: 37.5379,
      lng: 127.1255,
      distanceMeters: 151,
    });
    const point = mapPreviewPoints([bus], [])[0];
    if (!point) throw new Error("Missing preview point fixture");
    const onActivePointChange = vi.fn();
    const result = renderMap({ points: [point], onActivePointChange });
    const marker = markerInstances[0];

    expect(markerInstances).toHaveLength(1);
    marker?.getElement().click();
    expect(onActivePointChange).toHaveBeenCalledWith(point.key);
    expect(popupInstances[0]?.isOpen()).toBe(true);

    result.rerender(
      <MapLibrePreviewMap {...result.props} points={[point]} activePointKey={point.key} />,
    );
    expect(markerInstances).toHaveLength(1);
    expect(markerInstances[0]).toBe(marker);

    result.unmount();
    expect(marker?.remove).toHaveBeenCalledOnce();
    expect(popupInstances[0]?.listenerCount()).toBe(0);
  });
});
