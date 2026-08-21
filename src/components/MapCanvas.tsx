import type { CircleMarker as LeafletCircleMarker } from "leaflet";
import { useEffect, useRef, useState, type ReactNode } from "react";import {
  CircleMarker,
  MapContainer,
  Popup,
  TileLayer,
  useMap,
  useMapEvents,
  type CircleMarkerProps,
} from "react-leaflet";
import type { BusStop } from "../domain/bus";
import { stationDisplayLine, type SubwayStation } from "../domain/subway";
import { useMediaQuery } from "../hooks/useMediaQuery";

interface Point {
  readonly lat: number;
  readonly lng: number;
}
interface MapCanvasProps {
  readonly center: Point;
  readonly stops: readonly BusStop[];
  readonly selectedStop: BusStop | null;
  readonly selectedStopIds?: readonly BusStop["id"][];
  readonly pendingStops?: readonly BusStop[];
  readonly subwayStations?: readonly SubwayStation[];
  readonly pendingSubwayStations?: readonly SubwayStation[];
  readonly selectedSubwayStationIds?: readonly SubwayStation["id"][];
  readonly onCenterChange: (center: Point) => void;
  readonly onSelect: (stop: BusStop) => void;
  readonly onAddPending?: (stop: BusStop) => void;
  readonly onSelectSubway?: (station: SubwayStation) => void;
  readonly onAddPendingSubway?: (station: SubwayStation) => void;
}

interface AccessibleMarkerProps {
  readonly label: string;
  readonly active: boolean;
  readonly onSelect: () => void;
  readonly children?: ReactNode;
  readonly markerProps: CircleMarkerProps;
  readonly onMarkerReady?: (marker: LeafletCircleMarker | null) => void;
}

/** CircleMarker whose element stays an accessible button with a CURRENT
 * `aria-pressed`: the `add` event fires once, so selection changes are
 * re-synced through an effect instead of a stale closure. */
function AccessibleMarker({
  label,
  active,
  onSelect,
  children,
  markerProps,
  onMarkerReady,
}: AccessibleMarkerProps) {
  const [marker, setMarker] = useState<LeafletCircleMarker | null>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useEffect(() => {
    if (marker === null) {
      return;
    }
    const element = marker.getElement();
    if (!element) {
      return;
    }
    element.setAttribute("role", "button");
    element.setAttribute("tabindex", "0");
    element.setAttribute("aria-label", label);
    element.setAttribute("aria-pressed", String(active));
    element.classList.add("map-marker-hit-target");
    const handleKeydown = (event: Event) => {
      const keyboardEvent = event as KeyboardEvent;
      if (keyboardEvent.key === "Escape") {
        marker.closePopup();
        return;
      }
      if (keyboardEvent.key !== "Enter" && keyboardEvent.key !== " ") {
        return;
      }
      keyboardEvent.preventDefault();
      // Enter must replace any open popup, matching the click behavior.
      marker.closePopup();
      onSelectRef.current();
      marker.openPopup();
    };
    element.addEventListener("keydown", handleKeydown);

    // Escape inside the popup content (focus moved past the marker) must
    // also close: Leaflet's document-level handler is inert here, so the
    // popup's own DOM listens for it.
    const popupElement = marker.getPopup()?.getElement();
    const handlePopupKeydown = (event: Event) => {
      if ((event as KeyboardEvent).key === "Escape") {
        marker.closePopup();
        (marker.getElement() as HTMLElement | null)?.focus();
      }
    };
    popupElement?.addEventListener("keydown", handlePopupKeydown);

    return () => {
      element.removeEventListener("keydown", handleKeydown);
      popupElement?.removeEventListener("keydown", handlePopupKeydown);
    };
  }, [marker, label, active]);

  return (
    <CircleMarker
      ref={(m: LeafletCircleMarker | null) => {
        setMarker(m);
        onMarkerReady?.(m);
      }}
      {...markerProps}
    >
      {children}
    </CircleMarker>
  );
}

/** One map point: a visible circle (18-22px) plus a dedicated invisible
 * 44px interactive circle that carries click, keyboard, and aria state. The
 * SVG path's geometry is Leaflet's hit area, so the hit circle is real
 * geometry, not a CSS box. Leaflet applies `pathOptions.className` only at
 * creation (setStyle never re-applies it), so the visible circle's
 * `is-active` class is toggled on its element through an effect. */
function MapPointMarker({
  label,
  active,
  onSelect,
  children,
  center,
  visualClassName,
}: {
  readonly label: string;
  readonly active: boolean;
  readonly onSelect: () => void;
  readonly children?: ReactNode;
  readonly center: Point;
  readonly visualClassName: string;
}) {
  const [visualMarker, setVisualMarker] = useState<LeafletCircleMarker | null>(
    null,
  );
  const hitMarkerRef = useRef<LeafletCircleMarker | null>(null);
  const [baseClass, suffix] = visualClassName.split(" ");

  useEffect(() => {
    if (visualMarker === null) {
      return;
    }
    const element = visualMarker.getElement();
    if (!element || baseClass === undefined) {
      return;
    }
    element.classList.add(baseClass);
    element.classList.toggle("is-active", suffix === "is-active");
  }, [visualMarker, baseClass, suffix]);

  return (
    <>
      <CircleMarker
        ref={setVisualMarker}
        center={center}
        radius={9}
        interactive={false}
        pathOptions={{ fillOpacity: 1, weight: 3 }}
      />
      <AccessibleMarker
        label={label}
        active={active}
        onSelect={onSelect}
        markerProps={{
          center,
          radius: 22,
          pathOptions: {
            className: "map-marker-hit",
            stroke: false,
            fill: true,
            fillColor: "transparent",
            fillOpacity: 0,
          },
          eventHandlers: {
            click: onSelect,
            mouseover: () => {
              hitMarkerRef.current?.openPopup();
            },
          },
        }}
        onMarkerReady={(m) => { hitMarkerRef.current = m; }}
      >
        {children}
      </AccessibleMarker>
    </>
  );
}

function CenterObserver({
  center,
  onCenterChange,
}: {
  readonly center: Point;
  readonly onCenterChange: (center: Point) => void;
}) {
  const map = useMap();
  useMapEvents({
    moveend(event) {
      const nextCenter = event.target.getCenter();
      onCenterChange({ lat: nextCenter.lat, lng: nextCenter.lng });
    },
  });

  // Machine-consumed runtime truth: the REAL Leaflet instance options, so QA
  // can prove animation settings without relying on CSS.
  useEffect(() => {
    const container = map.getContainer();
    container.dataset.leafletZoomAnimation = String(map.options.zoomAnimation);
    container.dataset.leafletFadeAnimation = String(map.options.fadeAnimation);
    container.dataset.leafletMarkerZoomAnimation = String(
      map.options.markerZoomAnimation,
    );
  }, [map]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: primitive deps keep pan position stable across re-renders
  useEffect(() => {
    const current = map.getCenter();
    if (
      Math.abs(current.lat - center.lat) > 0.0001 ||
      Math.abs(current.lng - center.lng) > 0.0001
    ) {
      map.setView(center, map.getZoom(), { animate: false });
    }
  }, [center.lat, center.lng, map]);

  return null;
}

export function MapCanvas({
  center,
  stops,
  selectedStop,
  selectedStopIds = [],
  pendingStops = [],
  subwayStations = [],
  pendingSubwayStations = [],
  selectedSubwayStationIds = [],
  onCenterChange,
  onSelect,
  onAddPending,
  onSelectSubway,
  onAddPendingSubway,
}: MapCanvasProps) {
  const savedStopIds = new Set(stops.map((stop) => stop.id));
  const savedStationIds = new Set(subwayStations.map((station) => station.id));
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  return (
    <section className="picker-map-frame" aria-label="서울 버스 정류장 지도">
      <MapContainer
        center={center}
        zoom={15}
        minZoom={11}
        maxZoom={19}
        scrollWheelZoom="center"
        touchZoom="center"
        doubleClickZoom="center"
        zoomAnimation={!reducedMotion}
        fadeAnimation={!reducedMotion}
        markerZoomAnimation={!reducedMotion}
        className="picker-map"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          maxZoom={19}
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <CenterObserver center={center} onCenterChange={onCenterChange} />
        {stops.map((stop) => {
          const active =
            selectedStop?.id === stop.id || selectedStopIds.includes(stop.id);
          return (
            <MapPointMarker
              key={stop.id}
              label={`${stop.name} 정류장, ARS ${stop.arsId}, 중심에서 ${Math.round(
                stop.distanceMeters,
              )}미터`}
              active={active}
              onSelect={() => onSelect(stop)}
              center={{ lat: stop.lat, lng: stop.lng }}
              visualClassName={
                active ? "map-marker-bus is-active" : "map-marker-bus"
              }
            >
              <Popup>
                <strong>{stop.name}</strong>
                <br />
                ARS {stop.arsId}
              </Popup>
            </MapPointMarker>
          );
        })}
        {pendingStops
          .filter((stop) => !savedStopIds.has(stop.id))
          .map((stop) => (
            <MapPointMarker
              key={`pending-${stop.id}`}
              label={`${stop.name} 정류장, ARS ${stop.arsId}, 눌러서 추가`}
              active={false}
              onSelect={() => onAddPending?.(stop)}
              center={{ lat: stop.lat, lng: stop.lng }}
              visualClassName="map-marker-pending"
            >
              <Popup>
                <strong>{stop.name}</strong>
                <br />
                ARS {stop.arsId} · 눌러서 경로에 추가
              </Popup>
            </MapPointMarker>
          ))}
        {pendingSubwayStations
          .filter((station) => !savedStationIds.has(station.id))
          .map((station) => (
            <MapPointMarker
              key={`pending-subway-${station.id}`}
              label={`${station.name} 지하철역, ${stationDisplayLine(station)}, 눌러서 추가`}
              active={false}
              onSelect={() => onAddPendingSubway?.(station)}
              center={{ lat: station.lat, lng: station.lng }}
              visualClassName="map-marker-pending-subway"
            >
              <Popup>
                <strong>{station.name}</strong>
                <br />
                {stationDisplayLine(station)} · 눌러서 경로에 추가
              </Popup>
            </MapPointMarker>
          ))}
        {subwayStations.map((station) => {
          const active = selectedSubwayStationIds.includes(station.id);
          return (
            <MapPointMarker
              key={`subway-${station.id}`}
              label={`${station.name} 지하철역, ${stationDisplayLine(station)}, 중심에서 ${Math.round(
                station.distanceMeters,
              )}미터`}
              active={active}
              onSelect={() => onSelectSubway?.(station)}
              center={{ lat: station.lat, lng: station.lng }}
              visualClassName={
                active ? "map-marker-subway is-active" : "map-marker-subway"
              }
            >
              <Popup>
                <strong>{station.name}</strong>
                <br />
                {stationDisplayLine(station)}
              </Popup>
            </MapPointMarker>
          );
        })}
      </MapContainer>
    </section>
  );
}
