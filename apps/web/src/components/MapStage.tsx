import { ChevronDown, ChevronUp } from "lucide-react";
import { useEffect, useState } from "react";
import type { BusStop } from "../domain/bus";
import type { SubwayStation } from "../domain/subway";
import { MapCanvas } from "./MapCanvas";

interface Point {
  readonly lat: number;
  readonly lng: number;
}

interface MapStageProps {
  readonly stops: readonly BusStop[];
  readonly subwayStations: readonly SubwayStation[];
  readonly selectedStops: readonly BusStop[];
  readonly selectedSubwayStation: SubwayStation | null;
  readonly center: Point;
  readonly isDesktop: boolean;
  readonly onSelectStop: (stop: BusStop) => void;
  readonly onSelectSubwayStation: (station: SubwayStation) => void;
}

export function MapStage({
  stops,
  subwayStations,
  selectedStops,
  selectedSubwayStation,
  center,
  isDesktop,
  onSelectStop,
  onSelectSubwayStation,
}: MapStageProps) {
  const [mapCenter, setMapCenter] = useState<Point>(center);
  const [mapExpanded, setMapExpanded] = useState(false);
  const hasSelection =
    selectedStops.length > 0 || selectedSubwayStation !== null;

  useEffect(() => {
    setMapCenter(center);
  }, [center]);

  return (
    <section
      className={`map-stage${mapExpanded ? " is-expanded" : ""}${
        hasSelection ? " has-selection" : ""
      }`}
      aria-label="선택한 정류장과 역 지도"
    >
      <div className="stage-live-map">
        <MapCanvas
          center={mapCenter}
          stops={stops}
          selectedStop={null}
          selectedStopIds={selectedStops.map((stop) => stop.id)}
          subwayStations={subwayStations}
          selectedSubwayStationIds={
            selectedSubwayStation === null
              ? []
              : [selectedSubwayStation.id]
          }
          onCenterChange={setMapCenter}
          onSelect={onSelectStop}
          onSelectSubway={onSelectSubwayStation}
        />
      </div>

      {!isDesktop ? (
        <button
          className="map-expand-toggle"
          type="button"
          aria-expanded={mapExpanded}
          onClick={() => setMapExpanded((current) => !current)}
        >
          {mapExpanded ? (
            <ChevronUp aria-hidden="true" />
          ) : (
            <ChevronDown aria-hidden="true" />
          )}
          {mapExpanded ? "지도 접기" : "지도 펼치기"}
        </button>
      ) : null}
    </section>
  );
}
