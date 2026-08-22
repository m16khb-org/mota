import { Crosshair, LocateFixed, MapPin, Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { fetchNearbyStops, isServiceAreaError } from "../api/client";
import type { BusStop } from "../domain/bus";
import { locateCoarseNotice, locateFailureNotice, requestCurrentPosition } from "./locate";
import { MapCanvas } from "./MapCanvas";

const DEFAULT_CENTER = { lat: 37.5366, lng: 127.1253 };

interface MapPickerProps {
  readonly initialStop: BusStop | null;
  readonly onClose: () => void;
  readonly onSave: (stops: readonly BusStop[]) => void;
}

export function MapPicker({ initialStop, onClose, onSave }: MapPickerProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [center, setCenter] = useState(
    initialStop ? { lat: initialStop.lat, lng: initialStop.lng } : DEFAULT_CENTER,
  );
  const [stops, setStops] = useState<BusStop[]>(initialStop ? [initialStop] : []);
  const [selectedStops, setSelectedStops] = useState<BusStop[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mapStops = [
    ...selectedStops,
    ...stops.filter(
      (stop) => !selectedStops.some((selected) => selected.id === stop.id),
    ),
  ];

  const toggleStop = (stop: BusStop) => {
    setSelectedStops((current) =>
      current.some((selected) => selected.id === stop.id)
        ? current.filter((selected) => selected.id !== stop.id)
        : [...current, stop],
    );
  };

  useEffect(() => {
    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), [href], input:not(:disabled), [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable || focusable.length === 0) {
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [onClose]);

  const searchNearby = async () => {
    setLoading(true);
    setError(null);
    try {
      const nextStops = await fetchNearbyStops(center);
      setStops(nextStops);
      if (nextStops.length === 0) {
        setError("이 주변에서 정류장을 찾지 못했습니다. 지도를 옮기거나 확대해 보세요.");
      }
    } catch (error) {
      setError(
        isServiceAreaError(error)
          ? "서울 서비스 범위 밖이에요. 지도를 서울 근처로 옮겨 주세요."
          : "정류장을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.",
      );
    } finally {
      setLoading(false);
    }
  };

  const useCurrentLocation = () => {
    setError(null);
    void requestCurrentPosition().then((result) => {
      if (result.kind === "located") {
        setCenter({ lat: result.lat, lng: result.lng });
        const coarse = locateCoarseNotice(result);
        if (coarse !== null) {
          setError(coarse);
        }
        return;
      }
      const notice = locateFailureNotice(result);
      if (notice !== null) {
        setError(notice);
      }
    });
  };

  return (
    <div
      ref={dialogRef}
      className="picker-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="picker-title"
    >
      <div className="picker-shell">
        <div className="sheet-handle" aria-hidden="true" />
        <header className="picker-header">
          <div>
            <span className="eyebrow">정확한 ARS 정류장</span>
            <h2 id="picker-title">지도에서 정류장 선택</h2>
          </div>
          <button
            ref={closeButtonRef}
            className="icon-button"
            type="button"
            onClick={onClose}
            aria-label="닫기"
          >
            <X aria-hidden="true" />
          </button>
        </header>

        <div className="picker-map-wrap">
          <MapCanvas
            center={center}
            stops={mapStops}
            selectedStop={null}
            selectedStopIds={selectedStops.map((stop) => stop.id)}
            onCenterChange={setCenter}
            onSelect={toggleStop}
          />
          <div className="map-center-pin" aria-hidden="true">
            <Crosshair />
          </div>
          <button className="locate-button" type="button" onClick={useCurrentLocation}>
            <LocateFixed aria-hidden="true" />
            현위치
          </button>
        </div>

        <section className="picker-results" aria-busy={loading}>
          <div className="picker-actions">
            <div>
              <strong>지도 중심 기준</strong>
              <span>
                {center.lat.toFixed(5)}, {center.lng.toFixed(5)}
              </span>
            </div>
            <button className="primary-button compact" type="button" onClick={searchNearby}>
              <Search aria-hidden="true" />
              {loading ? "찾는 중…" : "이 위치에서 찾기"}
            </button>
          </div>

          {error ? (
            <p className="inline-error" role="alert">
              {error}
            </p>
          ) : null}

          {stops.length > 0 ? (
            <div
              className="result-summary"
              data-testid="stop-result-summary"
              data-stop-count={stops.length}
            >
              <strong>주변 정류장 {stops.length}곳</strong>
              <span>목록을 스크롤해 지도 핀과 ARS 번호를 비교하세요.</span>
            </div>
          ) : null}

          <div className="stop-result-list">
            {stops.map((stop) => {
              const active = selectedStops.some(
                (selected) => selected.id === stop.id,
              );
              return (
                <button
                  key={stop.id}
                  className={`stop-result${active ? " is-active" : ""}`}
                  type="button"
                  onClick={() => toggleStop(stop)}
                  aria-label={`${stop.name} 정류장 ${stop.arsId}, 중심에서 ${Math.round(
                    stop.distanceMeters,
                  )}미터, 선택`}
                  aria-pressed={active}
                >
                  <MapPin aria-hidden="true" />
                  <span>
                    <strong>{stop.name}</strong>
                    <small>
                      ARS {stop.arsId} · 중심에서 {Math.round(stop.distanceMeters)}m
                    </small>
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <footer className="picker-footer">
          <div className="picker-selection">
            <span>선택한 정류장</span>
            <strong>
              {selectedStops.length > 0
                ? `${selectedStops.length}개 · ${selectedStops
                    .slice(0, 2)
                    .map((stop) => stop.name)
                    .join(", ")}`
                : "아직 없음"}
            </strong>
          </div>
          <button
            className="primary-button"
            type="button"
            disabled={selectedStops.length === 0}
            onClick={() => onSave(selectedStops)}
          >
            선택한 {selectedStops.length}개 저장
          </button>
        </footer>
      </div>
    </div>
  );
}
