import { useEffect, useRef, useState } from "react";
import {
  Map as MapLibreMap,
  NavigationControl,
  setWorkerUrl,
  type Map as MapLibreMapInstance,
  type MapEventType,
} from "maplibre-gl";
import mapLibreWorkerUrl from "./mapLibreWorker.ts?worker&url";
import {
  MAP_PREVIEW_BOUNDS,
  MAP_PREVIEW_BUILDING_LAYER_ID,
  MAP_PREVIEW_CONTROL_LOCALE,
  MAP_PREVIEW_INITIAL_CAMERA,
  MAP_PREVIEW_MOTION_POLICY,
  MAP_PREVIEW_PITCH_LIMITS,
  MAP_PREVIEW_STYLE_URL,
  MAP_PREVIEW_ZOOM_LIMITS,
} from "./mapPreviewConfig";
import type { MapPreviewPoint } from "./mapPreviewPoints";
import {
  createPreviewMarkerPool,
  type MapPreviewPointKey,
  type PreviewMarkerPool,
} from "./previewMarkers";
import type { PreviewCenter } from "./usePreviewNearbyPoints";

export type MapPreviewFatal = Readonly<{
  readonly kind: "construction" | "style" | "missing-building-layer" | "webgl-context-lost";
  readonly error: Error;
}>;

export type MapPreviewDegraded = Readonly<{
  readonly kind: "resource";
  readonly error: Error;
}>;

export interface MapLibrePreviewMapProps {
  readonly center: PreviewCenter;
  readonly onReady: () => void;
  readonly onCenterChange: (center: PreviewCenter) => void;
  readonly onFatal: (failure: MapPreviewFatal) => void;
  readonly onDegraded: (failure: MapPreviewDegraded) => void;
  readonly points: readonly MapPreviewPoint[];
  readonly activePointKey: MapPreviewPointKey | null;
  readonly onActivePointChange: (key: MapPreviewPointKey | null) => void;
}

const LOCAL_IDEOGRAPH_FONT_FAMILY = '"Pretendard Variable", Pretendard, "Noto Sans KR", sans-serif';

function normalizedCenter(center: PreviewCenter): PreviewCenter {
  return {
    lat: Number(center.lat.toFixed(6)),
    lng: Number(center.lng.toFixed(6)),
  };
}

function sameCenter(left: PreviewCenter, right: PreviewCenter) {
  return left.lat === right.lat && left.lng === right.lng;
}

function syncCameraAttributes(container: HTMLDivElement, map: MapLibreMapInstance) {
  const mapCenter = map.getCenter();
  container.dataset.centerLng = mapCenter.lng.toFixed(6);
  container.dataset.centerLat = mapCenter.lat.toFixed(6);
  container.dataset.zoom = map.getZoom().toFixed(3);
  container.dataset.pitch = map.getPitch().toFixed(3);
  container.dataset.bearing = map.getBearing().toFixed(3);
}

function eventError(event: { readonly error?: { readonly message?: string } }) {
  return event.error instanceof Error
    ? event.error
    : new Error(event.error?.message ?? "MapLibre reported an unknown error.");
}

function isResourceError(event: object) {
  return "sourceId" in event || "tile" in event || "resourceType" in event || "resource" in event;
}

export function MapLibrePreviewMap({
  center,
  onReady,
  onCenterChange,
  onFatal,
  onDegraded,
  points,
  activePointKey,
  onActivePointChange,
}: MapLibrePreviewMapProps) {
  const centerLat = center.lat;
  const centerLng = center.lng;
  const containerRef = useRef<HTMLDivElement>(null);
  const [mapReadyData, setMapReadyData] = useState(false);
  const mapRef = useRef<MapLibreMapInstance | null>(null);
  const markerPoolRef = useRef<PreviewMarkerPool | null>(null);
  const lastReportedCenterRef = useRef(normalizedCenter(center));
  const pendingCenterRef = useRef<PreviewCenter | null>(null);
  const centerFrameRef = useRef<number | null>(null);
  const mountedRef = useRef(false);
  const callbacksRef = useRef({
    onReady,
    onCenterChange,
    onFatal,
    onDegraded,
    onActivePointChange,
  });
  callbacksRef.current = {
    onReady,
    onCenterChange,
    onFatal,
    onDegraded,
    onActivePointChange,
  };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    setWorkerUrl(mapLibreWorkerUrl);
    mountedRef.current = true;
    let map: MapLibreMapInstance | null = null;
    let control: NavigationControl | null = null;
    let observer: ResizeObserver | null = null;

    const reportFatal = (failure: MapPreviewFatal) => {
      if (mountedRef.current) callbacksRef.current.onFatal(failure);
    };
    const onLoad = () => {
      if (!map || !mountedRef.current) return;
      if (!map.getLayer(MAP_PREVIEW_BUILDING_LAYER_ID)) {
        reportFatal({
          kind: "missing-building-layer",
          error: new Error(`Liberty style is missing ${MAP_PREVIEW_BUILDING_LAYER_ID}.`),
        });
        return;
      }
      syncCameraAttributes(container, map);
      setMapReadyData(true);
      callbacksRef.current.onReady();
    };
    const onError = (event: MapEventType["error"]) => {
      const error = eventError(event);
      if (isResourceError(event)) {
        if (mountedRef.current) {
          callbacksRef.current.onDegraded({ kind: "resource", error });
        }
        return;
      }
      reportFatal({ kind: "style", error });
    };
    const onContextLost = (event: MapEventType["webglcontextlost"]) => {
      reportFatal({
        kind: "webgl-context-lost",
        error: eventError(event as unknown as { error?: Error }),
      });
    };
    const onMoveEnd = () => {
      if (!map || !mountedRef.current) return;
      syncCameraAttributes(container, map);
      const mapCenter = map.getCenter();
      const nextCenter = normalizedCenter({
        lat: mapCenter.lat,
        lng: mapCenter.lng,
      });
      if (sameCenter(nextCenter, lastReportedCenterRef.current)) return;
      lastReportedCenterRef.current = nextCenter;
      pendingCenterRef.current = nextCenter;
      if (centerFrameRef.current !== null) return;
      centerFrameRef.current = requestAnimationFrame(() => {
        centerFrameRef.current = null;
        const pending = pendingCenterRef.current;
        pendingCenterRef.current = null;
        if (pending && mountedRef.current) {
          callbacksRef.current.onCenterChange(pending);
        }
      });
    };

    try {
      map = new MapLibreMap({
        container,
        style: MAP_PREVIEW_STYLE_URL,
        center: [...MAP_PREVIEW_INITIAL_CAMERA.center],
        zoom: MAP_PREVIEW_INITIAL_CAMERA.zoom,
        pitch: MAP_PREVIEW_INITIAL_CAMERA.pitch,
        bearing: MAP_PREVIEW_INITIAL_CAMERA.bearing,
        minZoom: MAP_PREVIEW_ZOOM_LIMITS.min,
        maxZoom: MAP_PREVIEW_ZOOM_LIMITS.max,
        minPitch: MAP_PREVIEW_PITCH_LIMITS.min,
        maxPitch: MAP_PREVIEW_PITCH_LIMITS.max,
        maxBounds: [[...MAP_PREVIEW_BOUNDS[0]], [...MAP_PREVIEW_BOUNDS[1]]],
        roll: 0,
        rollEnabled: false,
        locale: MAP_PREVIEW_CONTROL_LOCALE,
        ...MAP_PREVIEW_MOTION_POLICY,
        localIdeographFontFamily: LOCAL_IDEOGRAPH_FONT_FAMILY,
        collectResourceTiming: false,
      });
      mapRef.current = map;
      markerPoolRef.current = createPreviewMarkerPool(map, (key) =>
        callbacksRef.current.onActivePointChange(key),
      );
      map.on("load", onLoad);
      map.on("error", onError);
      map.on("webglcontextlost", onContextLost);
      map.on("moveend", onMoveEnd);
      control = new NavigationControl({
        showZoom: true,
        showCompass: true,
        visualizePitch: true,
      });
      map.addControl(control, "top-right");
      observer = new ResizeObserver(() => map?.resize());
      observer.observe(container);
    } catch (cause) {
      reportFatal({
        kind: "construction",
        error: cause instanceof Error ? cause : new Error(String(cause)),
      });
    }

    return () => {
      mountedRef.current = false;
      if (centerFrameRef.current !== null) {
        cancelAnimationFrame(centerFrameRef.current);
        centerFrameRef.current = null;
      }
      pendingCenterRef.current = null;
      observer?.disconnect();
      markerPoolRef.current?.destroy();
      markerPoolRef.current = null;
      if (map) {
        map.off("load", onLoad);
        map.off("error", onError);
        map.off("webglcontextlost", onContextLost);
        map.off("moveend", onMoveEnd);
        if (control) map.removeControl(control);
        map.remove();
      }
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const nextCenter = normalizedCenter({ lat: centerLat, lng: centerLng });
    const current = map.getCenter();
    const mapCenter = normalizedCenter({ lat: current.lat, lng: current.lng });
    if (sameCenter(nextCenter, mapCenter)) return;
    if (centerFrameRef.current !== null) {
      cancelAnimationFrame(centerFrameRef.current);
      centerFrameRef.current = null;
    }
    pendingCenterRef.current = null;
    lastReportedCenterRef.current = nextCenter;
    map.jumpTo({ center: [nextCenter.lng, nextCenter.lat] });
  }, [centerLat, centerLng]);

  useEffect(() => {
    markerPoolRef.current?.reconcile(points, activePointKey);
  }, [points, activePointKey]);

  return (
    <div
      ref={containerRef}
      data-testid="maplibre-preview-map"
      data-map-ready={mapReadyData}
      data-building-layer={mapReadyData ? MAP_PREVIEW_BUILDING_LAYER_ID : undefined}
    />
  );
}
