import type {
  CircleMarker as LeafletCircleMarker,
  LeafletEvent,
} from "leaflet";
import { useEffect } from "react";
import {
  CircleMarker,
  MapContainer,
  Popup,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet";
import type { BusStop } from "../domain/bus";
import type { SubwayStation } from "../domain/subway";

interface Point {
  readonly lat: number;
  readonly lng: number;
}
interface MapCanvasProps {
  readonly center: Point;
  readonly stops: readonly BusStop[];
  readonly selectedStop: BusStop | null;
  readonly selectedStopIds?: readonly BusStop["id"][];
  readonly subwayStations?: readonly SubwayStation[];
  readonly selectedSubwayStationIds?: readonly SubwayStation["id"][];
  readonly onCenterChange: (center: Point) => void;
  readonly onSelect: (stop: BusStop) => void;
  readonly onSelectSubway?: (station: SubwayStation) => void;
}

function makeMarkerAccessible(label: string, onSelect: () => void) {
  return (event: LeafletEvent) => {
    const marker = event.target as LeafletCircleMarker;
    const element = marker.getElement();
    if (!element) {
      return;
    }

    element.setAttribute("role", "button");
    element.setAttribute("tabindex", "0");
    element.setAttribute("aria-label", label);
    element.addEventListener("keydown", (event) => {
      const keyboardEvent = event as KeyboardEvent;
      if (keyboardEvent.key !== "Enter" && keyboardEvent.key !== " ") {
        return;
      }
      keyboardEvent.preventDefault();
      onSelect();
      marker.openPopup();
    });
  };
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

  useEffect(() => {
    const current = map.getCenter();
    if (
      Math.abs(current.lat - center.lat) > 0.0001 ||
      Math.abs(current.lng - center.lng) > 0.0001
    ) {
      map.setView(center, map.getZoom(), { animate: false });
    }
  }, [center, map]);

  return null;
}

export function MapCanvas({
  center,
  stops,
  selectedStop,
  selectedStopIds = [],
  subwayStations = [],
  selectedSubwayStationIds = [],
  onCenterChange,
  onSelect,
  onSelectSubway,
}: MapCanvasProps) {
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
        className="picker-map"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <CenterObserver center={center} onCenterChange={onCenterChange} />
        {stops.map((stop) => {
          const active =
            selectedStop?.id === stop.id || selectedStopIds.includes(stop.id);
          return (
            <CircleMarker
              key={stop.id}
              center={{ lat: stop.lat, lng: stop.lng }}
              radius={active ? 11 : 9}
              pathOptions={{
                color: active ? "#0b0b0b" : "#155eef",
                fillColor: active ? "#c7f000" : "#ffffff",
                fillOpacity: 1,
                weight: active ? 4 : 3,
              }}
              eventHandlers={{
                add: makeMarkerAccessible(
                  `${stop.name} 정류장, ARS ${stop.arsId}, 중심에서 ${Math.round(
                    stop.distanceMeters,
                  )}미터`,
                  () => onSelect(stop),
                ),
                click: () => onSelect(stop),
              }}
            >
              <Popup>
                <strong>{stop.name}</strong>
                <br />
                ARS {stop.arsId}
              </Popup>
            </CircleMarker>
          );
        })}
        {subwayStations.map((station) => {
          const active = selectedSubwayStationIds.includes(station.id);
          return (
            <CircleMarker
              key={`subway-${station.id}`}
              center={{ lat: station.lat, lng: station.lng }}
              radius={active ? 11 : 9}
              pathOptions={{
                color: active ? "#0b0b0b" : "#7c3aed",
                fillColor: active ? "#c7f000" : "#ffffff",
                fillOpacity: 1,
                weight: active ? 4 : 3,
              }}
              eventHandlers={{
                add: makeMarkerAccessible(
                  `${station.name} 지하철역, ${station.line}, 중심에서 ${Math.round(
                    station.distanceMeters,
                  )}미터`,
                  () => onSelectSubway?.(station),
                ),
                click: () => onSelectSubway?.(station),
              }}
            >
              <Popup>
                <strong>{station.name}</strong>
                <br />
                {station.line}
              </Popup>
            </CircleMarker>
          );
        })}
      </MapContainer>
    </section>
  );
}
