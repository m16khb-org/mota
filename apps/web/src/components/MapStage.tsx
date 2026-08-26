import { ChevronUp } from "lucide-react";
import { useEffect, useState } from "react";
import type { BusStop } from "../domain/bus";
import type { SubwayStation } from "../domain/subway";
import { useInlineMapSearch } from "../hooks/useInlineMapSearch";
import { InlineMapSearchControls } from "./InlineMapSearchControls";
import { MapCanvas } from "./MapCanvas";
import type { TransitMode } from "./TransitPointSelector";

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
  readonly searchMode: TransitMode | null;
  readonly onCloseMobileMap: () => void;
  readonly onCancelSearch: () => void;
  readonly onSaveBusStops: (stops: readonly BusStop[]) => void;
  readonly onSaveSubwayStations: (
    stations: readonly SubwayStation[],
  ) => void;
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
  searchMode,
  onCloseMobileMap,
  onCancelSearch,
  onSaveBusStops,
  onSaveSubwayStations,
  onSelectStop,
  onSelectSubwayStation,
}: MapStageProps) {
  const [mapCenter, setMapCenter] = useState<Point>(center);
  const hasSelection =
    selectedStops.length > 0 || selectedSubwayStation !== null;
  const searching = searchMode !== null;
  const search = useInlineMapSearch({
    mode: searchMode,
    center: mapCenter,
    savedStops: stops,
    savedStations: subwayStations,
  });

  useEffect(() => {
    setMapCenter(center);
  }, [center]);

  return (
    <section
      className={`map-stage${
        hasSelection ? " has-selection" : ""
      }${searching ? " is-searching" : ""}`}
      aria-label="선택한 정류장과 역 지도"
    >
      <div className="stage-live-map">
        <MapCanvas
          center={mapCenter}
          stops={stops}
          selectedStop={null}
          selectedStopIds={[
            ...selectedStops.map((stop) => stop.id),
            ...search.selectedBusStops.map((stop) => stop.id),
          ]}
          pendingStops={search.busStops}
          subwayStations={subwayStations}
          pendingSubwayStations={search.stations}
          selectedSubwayStationIds={
            [
              ...(selectedSubwayStation === null
                ? []
                : [selectedSubwayStation.id]),
              ...search.selectedStations.map((station) => station.id),
            ]
          }
          onCenterChange={setMapCenter}
          onSelect={onSelectStop}
          onAddPending={search.toggleBusStop}
          onSelectSubway={onSelectSubwayStation}
          onAddPendingSubway={search.toggleStation}
        />
      </div>

      {searchMode !== null ? (
        <InlineMapSearchControls
          mode={searchMode}
          loading={search.loading}
          error={search.error}
          busStops={search.busStops}
          stations={search.stations}
          selectedBusStopIds={search.selectedBusStops.map(
            (stop) => stop.id,
          )}
          selectedStationIds={search.selectedStations.map(
            (station) => station.id,
          )}
          onSearch={search.search}
          onToggleBusStop={search.toggleBusStop}
          onToggleStation={search.toggleStation}
          onCancel={onCancelSearch}
          onSave={() => {
            if (searchMode === "bus") {
              onSaveBusStops(search.selectedBusStops);
              return;
            }
            onSaveSubwayStations(search.selectedStations);
          }}
        />
      ) : null}

      {!isDesktop && !searching ? (
        <button
          className="map-close-toggle"
          type="button"
          onClick={onCloseMobileMap}
        >
          <ChevronUp aria-hidden="true" />
          지도 닫기
        </button>
      ) : null}
    </section>
  );
}
