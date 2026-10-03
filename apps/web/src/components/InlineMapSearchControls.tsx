import { BusFront, Check, CheckCircle2, RefreshCw, X } from "lucide-react";
import { useEffect, useRef } from "react";
import type { BusStop } from "../domain/bus";

interface InlineMapSearchControlsProps {
  readonly loading: boolean;
  readonly error: string | null;
  readonly busStops: readonly BusStop[];
  readonly selectedBusStopIds: readonly BusStop["id"][];
  readonly onSearch: () => void;
  readonly onToggleBusStop: (stop: BusStop) => void;
  readonly onCancel: () => void;
  readonly onSave: () => void;
}

export function InlineMapSearchControls({
  loading,
  error,
  busStops,
  selectedBusStopIds,
  onSearch,
  onToggleBusStop,
  onCancel,
  onSave,
}: InlineMapSearchControlsProps) {
  const regionRef = useRef<HTMLElement>(null);
  const resultCount = busStops.length;
  const selectedCount = selectedBusStopIds.length;

  useEffect(() => {
    regionRef.current?.focus();
  }, []);

  return (
    <section
      ref={regionRef}
      className="inline-map-search"
      data-mode="bus"
      aria-label="버스 정류장 지도 찾기"
      tabIndex={-1}
    >
      <header className="inline-map-search-toolbar">
        <div>
          <span className="eyebrow">현재 지도에서 찾기</span>
          <strong>
            <BusFront aria-hidden="true" /> 버스 정류장 고르기
          </strong>
        </div>
        <div className="inline-map-search-actions">
          <button className="map-search-secondary" type="button" onClick={onCancel}>
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
        <div className="inline-map-search-results-heading">
          <strong>후보 {resultCount}곳</strong>
          <span>눌러서 함께 볼 정류장을 고르세요</span>
        </div>
        <div className="inline-map-search-status">
          <p aria-live="polite">
            {loading ? "지도 중심 주변을 찾는 중…" : (error ?? `가까운 정류장 ${resultCount}곳`)}
          </p>
          <button type="button" disabled={loading} onClick={onSearch}>
            <RefreshCw aria-hidden="true" />
            {loading ? "찾는 중…" : "이 위치 다시 찾기"}
          </button>
        </div>

        {resultCount > 0 ? (
          <fieldset className="inline-map-result-reel">
            <legend className="sr-only">정류장 검색 후보</legend>
            {busStops.map((stop) => (
              <button
                key={stop.id}
                className="inline-map-result"
                data-mode="bus"
                type="button"
                aria-pressed={selectedBusStopIds.includes(stop.id)}
                onClick={() => onToggleBusStop(stop)}
              >
                <span className="inline-map-result-band" aria-hidden="true" />
                <span className="inline-map-result-content">
                  <strong>{stop.name}</strong>
                  <small>
                    ARS {stop.arsId} · {Math.round(stop.distanceMeters)}m
                  </small>
                </span>
                <CheckCircle2 className="inline-map-result-indicator" aria-hidden="true" />
              </button>
            ))}
          </fieldset>
        ) : null}
      </div>
    </section>
  );
}
