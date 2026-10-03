import { ChevronUp } from "lucide-react";
import { useEffect, useState } from "react";
import type { BusStop } from "../domain/bus";
import { useInlineMapSearch } from "../hooks/useInlineMapSearch";
import { InlineMapSearchControls } from "./InlineMapSearchControls";
import { MapCanvas } from "./MapCanvas";

interface Point {
  readonly lat: number;
  readonly lng: number;
}

interface MapStageProps {
  readonly stops: readonly BusStop[];
  readonly selectedStops: readonly BusStop[];
  readonly center: Point;
  readonly isDesktop: boolean;
  readonly searchMode: "bus" | null;
  readonly onCloseMobileMap: () => void;
  readonly onCancelSearch: () => void;
  readonly onSaveBusStops: (stops: readonly BusStop[]) => void;
  readonly onSelectStop: (stop: BusStop) => void;
}

export function MapStage({
  stops,
  selectedStops,
  center,
  isDesktop,
  searchMode,
  onCloseMobileMap,
  onCancelSearch,
  onSaveBusStops,
  onSelectStop,
}: MapStageProps) {
  const [mapCenter, setMapCenter] = useState<Point>(center);
  const hasSelection = selectedStops.length > 0;
  const searching = searchMode !== null;
  const search = useInlineMapSearch({
    mode: searchMode,
    center: mapCenter,
    savedStops: stops,
  });

  useEffect(() => {
    setMapCenter(center);
  }, [center]);

  return (
    <section
      className={`map-stage${
        hasSelection ? " has-selection" : ""
      }${searching ? " is-searching" : ""}`}
      data-map-state={searching ? "searching" : "browsing"}
      data-search-mode={searchMode ?? undefined}
      aria-label="선택한 정류장 지도"
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
          onCenterChange={setMapCenter}
          onSelect={onSelectStop}
          onAddPending={search.toggleBusStop}
        />
      </div>

      {searchMode !== null ? (
        <InlineMapSearchControls
          loading={search.loading}
          error={search.error}
          busStops={search.busStops}
          selectedBusStopIds={search.selectedBusStops.map((stop) => stop.id)}
          onSearch={search.search}
          onToggleBusStop={search.toggleBusStop}
          onCancel={onCancelSearch}
          onSave={() => {
            onSaveBusStops(search.selectedBusStops);
          }}
        />
      ) : null}

      {!isDesktop && !searching ? (
        <button className="map-close-toggle" type="button" onClick={onCloseMobileMap}>
          <ChevronUp aria-hidden="true" />
          지도 닫기
        </button>
      ) : null}
    </section>
  );
}
