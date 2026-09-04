import { useEffect, useRef, useState } from "react";
import type { TransitMapNetwork, TransitVehicle } from "@mota/contracts/transit-map";
import {
  Map as MapLibreMap,
  NavigationControl,
  Popup,
  setWorkerUrl,
  type Map as MapLibreMapInstance,
  type MapEventType,
} from "maplibre-gl";
import type { MapViewport } from "../../api/transitMapClient";
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
import { prepareVehicleTransition } from "./trainInterpolation";
import {
  createTransitMapLayers,
  type TransitMapLayers,
  type TransitMapLike,
  type TransitMapSelection,
} from "./transitMapLayers";

export type MapPreviewFatal = Readonly<{
  readonly kind: "construction" | "style" | "missing-building-layer" | "webgl-context-lost";
  readonly error: Error;
}>;

export type MapPreviewDegraded = Readonly<{
  readonly kind: "resource";
  readonly error: Error;
}>;

interface VehicleSnapshot {
  readonly bus: readonly TransitVehicle[];
  readonly subway: readonly TransitVehicle[];
}

export interface MapLibrePreviewMapProps {
  readonly onReady: () => void;
  readonly onFatal: (failure: MapPreviewFatal) => void;
  readonly onDegraded: (failure: MapPreviewDegraded) => void;
  readonly network?: TransitMapNetwork | null;
  readonly vehicles?: VehicleSnapshot;
  readonly selection?: TransitMapSelection | null;
  readonly onTransitSelect?: (selection: TransitMapSelection | null) => void;
  readonly onViewportChange?: (viewport: MapViewport) => void;
}

const LOCAL_IDEOGRAPH_FONT_FAMILY = '"Pretendard Variable", Pretendard, "Noto Sans KR", sans-serif';
const EMPTY_VEHICLES: VehicleSnapshot = { bus: [], subway: [] };
const EMPTY_ROUTES = { type: "FeatureCollection" as const, features: [] };
const VEHICLE_TRANSITION_MS = 800;

function placeVehicles(vehicles: VehicleSnapshot, network: TransitMapNetwork | null) {
  return {
    bus: prepareVehicleTransition([], vehicles.bus, network?.bus.routes ?? EMPTY_ROUTES)(1),
    subway: prepareVehicleTransition([], vehicles.subway, network?.subway.lines ?? EMPTY_ROUTES)(1),
  };
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
  onReady,
  onFatal,
  onDegraded,
  network = null,
  vehicles = EMPTY_VEHICLES,
  selection = null,
  onTransitSelect,
  onViewportChange,
}: MapLibrePreviewMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [mapReadyData, setMapReadyData] = useState(false);
  const mapRef = useRef<MapLibreMapInstance | null>(null);
  const popupRef = useRef<Popup | null>(null);
  const transitLayersRef = useRef<TransitMapLayers | null>(null);
  const transitDataRef = useRef({ network, vehicles, selection });
  transitDataRef.current = { network, vehicles, selection };
  const displayedVehiclesRef = useRef<VehicleSnapshot>(EMPTY_VEHICLES);
  const vehicleFrameRef = useRef<number | null>(null);
  const mountedRef = useRef(false);
  const callbacksRef = useRef({
    onReady,
    onFatal,
    onDegraded,
    onTransitSelect,
    onViewportChange,
  });
  callbacksRef.current = {
    onReady,
    onFatal,
    onDegraded,
    onTransitSelect,
    onViewportChange,
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
      transitLayersRef.current = createTransitMapLayers(
        map as unknown as TransitMapLike,
        (nextSelection) => callbacksRef.current.onTransitSelect?.(nextSelection),
      );
      if (transitDataRef.current.network) {
        transitLayersRef.current.setNetwork(transitDataRef.current.network);
      }
      displayedVehiclesRef.current = placeVehicles(
        transitDataRef.current.vehicles,
        transitDataRef.current.network,
      );
      transitLayersRef.current.setVehicles(displayedVehiclesRef.current);
      transitLayersRef.current.setSelection(transitDataRef.current.selection);
      syncCameraAttributes(container, map);
      reportViewport(map, callbacksRef.current.onViewportChange);
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
      reportViewport(map, callbacksRef.current.onViewportChange);
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
      if (vehicleFrameRef.current !== null) {
        cancelAnimationFrame(vehicleFrameRef.current);
        vehicleFrameRef.current = null;
      }
      observer?.disconnect();
      popupRef.current?.remove();
      popupRef.current = null;
      transitLayersRef.current?.destroy();
      transitLayersRef.current = null;
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
    if (network) transitLayersRef.current?.setNetwork(network);
  }, [network]);

  useEffect(() => {
    const layers = transitLayersRef.current;
    if (!layers) return;
    if (vehicleFrameRef.current !== null) {
      cancelAnimationFrame(vehicleFrameRef.current);
      vehicleFrameRef.current = null;
    }
    const previous = displayedVehiclesRef.current;
    const reducedMotion =
      globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const startedAt = performance.now();
    const currentNetwork = transitDataRef.current.network;
    const busTransition = prepareVehicleTransition(
      previous.bus,
      vehicles.bus,
      currentNetwork?.bus.routes ?? EMPTY_ROUTES,
    );
    const subwayTransition = prepareVehicleTransition(
      previous.subway,
      vehicles.subway,
      currentNetwork?.subway.lines ?? EMPTY_ROUTES,
    );
    if (reducedMotion || (!previous.bus.length && !previous.subway.length)) {
      displayedVehiclesRef.current = { bus: busTransition(1), subway: subwayTransition(1) };
      layers.setVehicles(displayedVehiclesRef.current);
      return;
    }
    layers.setVehicles({ bus: busTransition(0), subway: subwayTransition(0) });
    let lastFrame = -Infinity;
    const draw = (time: number) => {
      if (!mountedRef.current) return;
      const progress = Math.min(1, Math.max(0, (time - startedAt) / VEHICLE_TRANSITION_MS));
      if (time - lastFrame < 1000 / 30 && progress < 1) {
        vehicleFrameRef.current = requestAnimationFrame(draw);
        return;
      }
      lastFrame = time;
      const displayed = {
        bus: busTransition(progress),
        subway: subwayTransition(progress),
      };
      displayedVehiclesRef.current = displayed;
      layers.setVehicles(displayed);
      if (progress < 1) {
        vehicleFrameRef.current = requestAnimationFrame(draw);
      } else {
        vehicleFrameRef.current = null;
      }
    };
    vehicleFrameRef.current = requestAnimationFrame(draw);
    return () => {
      if (vehicleFrameRef.current !== null) {
        cancelAnimationFrame(vehicleFrameRef.current);
        vehicleFrameRef.current = null;
      }
    };
  }, [vehicles]);

  useEffect(() => {
    transitLayersRef.current?.setSelection(selection);
    const map = mapRef.current;
    if (!mapReadyData || !selection || !map || !transitLayersRef.current) {
      popupRef.current?.remove();
      popupRef.current = null;
      return;
    }
    const content = document.createElement("div");
    content.className = "map-preview-popup-detail";
    content.setAttribute("role", "group");
    content.setAttribute("aria-label", `${selection.name} 상세 정보`);
    const name = document.createElement("strong");
    name.textContent = selection.name;
    const detail = document.createElement("span");
    detail.textContent = selection.detail || selection.kind;
    content.append(name, detail);
    popupRef.current?.remove();
    let active = true;
    const popup = new Popup({
      closeButton: true,
      closeOnClick: false,
      focusAfterOpen: true,
      maxWidth: "280px",
    })
      .setLngLat([...selection.coordinates])
      .setDOMContent(content)
      .addTo(map);
    const onClose = () => {
      if (active) callbacksRef.current.onTransitSelect?.(null);
    };
    popup.on("close", onClose);
    popupRef.current = popup;
    return () => {
      active = false;
      popup.off("close", onClose);
      popup.remove();
      if (popupRef.current === popup) popupRef.current = null;
    };
  }, [selection, mapReadyData]);

  return (
    <div
      ref={containerRef}
      data-testid="maplibre-preview-map"
      data-map-ready={mapReadyData}
      data-building-layer={mapReadyData ? MAP_PREVIEW_BUILDING_LAYER_ID : undefined}
      data-subway-vehicles={vehicles.subway.length}
      data-bus-vehicles={vehicles.bus.length}
      data-subway-vehicle-position={vehicles.subway[0]?.coordinates.join(",")}
      data-bus-vehicle-position={vehicles.bus[0]?.coordinates.join(",")}
      data-subway-lines={network?.subway.lines.features.length ?? 0}
      data-subway-stations={network?.subway.stations.features.length ?? 0}
      data-bus-lines={network?.bus.routes.features.length ?? 0}
      data-bus-stops={network?.bus.stops.features.length ?? 0}
    />
  );
}

function reportViewport(
  map: MapLibreMapInstance,
  listener: ((viewport: MapViewport) => void) | undefined,
) {
  if (!listener) return;
  const bounds = map.getBounds();
  listener({
    west: Number(bounds.getWest().toFixed(6)),
    south: Number(bounds.getSouth().toFixed(6)),
    east: Number(bounds.getEast().toFixed(6)),
    north: Number(bounds.getNorth().toFixed(6)),
    zoom: Number(map.getZoom().toFixed(6)),
  });
}
