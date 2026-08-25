import { BusFront, Check, RefreshCw, TrainFront, X } from "lucide-react";
import { useEffect, useRef } from "react";
import type { BusStop } from "../domain/bus";
import { stationDisplayLine, type SubwayStation } from "../domain/subway";
import type { TransitMode } from "./TransitPointSelector";

interface InlineMapSearchControlsProps {
  readonly mode: TransitMode;
  readonly loading: boolean;
  readonly error: string | null;
  readonly busStops: readonly BusStop[];
  readonly stations: readonly SubwayStation[];
  readonly selectedBusStopIds: readonly BusStop["id"][];
  readonly selectedStationIds: readonly SubwayStation["id"][];
  readonly onSearch: () => void;
  readonly onToggleBusStop: (stop: BusStop) => void;
  readonly onToggleStation: (station: SubwayStation) => void;
  readonly onCancel: () => void;
  readonly onSave: () => void;
}

export function InlineMapSearchControls({
  mode,
  loading,
  error,
  busStops,
  stations,
  selectedBusStopIds,
  selectedStationIds,
  onSearch,
  onToggleBusStop,
  onToggleStation,
  onCancel,
  onSave,
}: InlineMapSearchControlsProps) {
  const regionRef = useRef<HTMLElement>(null);
  const isBus = mode === "bus";
  const resultCount = isBus ? busStops.length : stations.length;
  const selectedCount = isBus
    ? selectedBusStopIds.length
    : selectedStationIds.length;

  useEffect(() => {
    regionRef.current?.focus();
  }, []);

  return (
    <section
      ref={regionRef}
      className="inline-map-search"
      aria-label={isBus ? "버스 정류장 지도 찾기" : "지하철역 지도 찾기"}
      tabIndex={-1}
    >
      <header className="inline-map-search-toolbar">
        <div>
          <span className="eyebrow">현재 지도에서 찾기</span>
          <strong>
            {isBus ? (
              <BusFront aria-hidden="true" />
            ) : (
              <TrainFront aria-hidden="true" />
            )}
            {isBus ? "버스 정류장 고르기" : "지하철역 고르기"}
          </strong>
        </div>
        <div className="inline-map-search-actions">
          <button
            className="map-search-secondary"
            type="button"
            onClick={onCancel}
          >
            <X aria-hidden="true" />
            취소
          </button>
          <button
            className="map-search-primary"
            type="button"
            disabled={selectedCount === 0}
            onClick={onSave}
          >
            <Check aria-hidden="true" />
            {selectedCount}곳 저장
          </button>
        </div>
      </header>

      <div className="inline-map-search-results">
        <div className="inline-map-search-status">
          <p aria-live="polite">
            {loading
              ? "지도 중심 주변을 찾는 중…"
              : (error ??
                `가까운 ${isBus ? "정류장" : "역"} ${resultCount}곳`)}
          </p>
          <button
            type="button"
            disabled={loading}
            onClick={onSearch}
          >
            <RefreshCw aria-hidden="true" />
            {loading ? "찾는 중…" : "이 위치 다시 찾기"}
          </button>
        </div>

        {resultCount > 0 ? (
          <fieldset className="inline-map-result-reel">
            <legend className="sr-only">
              {isBus ? "정류장 검색 후보" : "지하철역 검색 후보"}
            </legend>
            {isBus
              ? busStops.map((stop) => (
                  <button
                    key={stop.id}
                    type="button"
                    aria-pressed={selectedBusStopIds.includes(stop.id)}
                    onClick={() => onToggleBusStop(stop)}
                  >
                    <strong>{stop.name}</strong>
                    <small>ARS {stop.arsId}</small>
                  </button>
                ))
              : stations.map((station) => (
                  <button
                    key={station.id}
                    type="button"
                    aria-pressed={selectedStationIds.includes(station.id)}
                    onClick={() => onToggleStation(station)}
                  >
                    <strong>{station.name}</strong>
                    <small>{stationDisplayLine(station)}</small>
                  </button>
                ))}
          </fieldset>
        ) : null}
      </div>
    </section>
  );
}
