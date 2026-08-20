import { Crosshair, LocateFixed, Search, TrainFront, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { fetchNearbySubwayStations, isServiceAreaError } from "../api/client";
import type { SubwayStation } from "../domain/subway";
import { MapCanvas } from "./MapCanvas";

interface Point {
  readonly lat: number;
  readonly lng: number;
}
interface SubwayPickerProps {
  readonly initialCenter: Point;
  readonly onClose: () => void;
  readonly onSave: (stations: readonly SubwayStation[]) => void;
}

export function SubwayPicker({
  initialCenter,
  onClose,
  onSave,
}: SubwayPickerProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [center, setCenter] = useState(initialCenter);
  const [stations, setStations] = useState<SubwayStation[]>([]);
  const [selectedStations, setSelectedStations] = useState<SubwayStation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mapStations = [
    ...selectedStations,
    ...stations.filter(
      (station) =>
        !selectedStations.some((selected) => selected.id === station.id),
    ),
  ];

  const toggleStation = (station: SubwayStation) => {
    setSelectedStations((current) =>
      current.some((selected) => selected.id === station.id)
        ? current.filter((selected) => selected.id !== station.id)
        : [...current, station],
    );
  };

  useEffect(() => {
    const previousFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
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
      const nextStations = await fetchNearbySubwayStations(center);
      setStations(nextStations);
      if (nextStations.length === 0) {
        setError("이 주변에서 지하철역을 찾지 못했습니다.");
      }
    } catch (error) {
      setError(
        isServiceAreaError(error)
          ? "서울 서비스 범위 밖이에요. 지도를 서울 근처로 옮겨 주세요."
          : "지하철역을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.",
      );
    } finally {
      setLoading(false);
    }
  };

  const useCurrentLocation = () => {
    if (!navigator.geolocation) {
      setError("이 브라우저에서는 현재 위치를 사용할 수 없습니다.");
      return;
    }
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (position) =>
        setCenter({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        }),
      () => setError("현재 위치를 확인하지 못했습니다."),
      { enableHighAccuracy: true, timeout: 8_000, maximumAge: 60_000 },
    );
  };

  return (
    <div
      ref={dialogRef}
      className="picker-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="subway-picker-title"
    >
      <div className="picker-shell">
        <div className="sheet-handle" aria-hidden="true" />
        <header className="picker-header">
          <div>
            <span className="eyebrow">지하철 경로 지점</span>
            <h2 id="subway-picker-title">지도에서 지하철역 선택</h2>
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
            stops={[]}
            selectedStop={null}
            subwayStations={mapStations}
            selectedSubwayStationIds={selectedStations.map(
              (station) => station.id,
            )}
            onCenterChange={setCenter}
            onSelect={() => undefined}
            onSelectSubway={toggleStation}
          />
          <div className="map-center-pin" aria-hidden="true">
            <Crosshair />
          </div>
          <button
            className="locate-button"
            type="button"
            onClick={useCurrentLocation}
          >
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
            <button
              className="primary-button compact"
              type="button"
              onClick={searchNearby}
            >
              <Search aria-hidden="true" />
              {loading ? "찾는 중…" : "이 위치에서 지하철역 찾기"}
            </button>
          </div>

          {error ? (
            <p className="inline-error" role="alert">
              {error}
            </p>
          ) : null}

          {stations.length > 0 ? (
            <div className="result-summary">
              <strong>주변 지하철역 {stations.length}곳</strong>
              <span>지도 마커나 목록을 눌러 여러 역을 선택하세요.</span>
            </div>
          ) : null}

          <div className="stop-result-list">
            {stations.map((station) => {
              const active = selectedStations.some(
                (selected) => selected.id === station.id,
              );
              return (
                <button
                  key={station.id}
                  className={`stop-result${active ? " is-active" : ""}`}
                  type="button"
                  onClick={() => toggleStation(station)}
                  aria-label={`${station.name} 지하철역 ${station.line}, 중심에서 ${Math.round(
                    station.distanceMeters,
                  )}미터, 선택`}
                  aria-pressed={active}
                >
                  <TrainFront aria-hidden="true" />
                  <span>
                    <strong>{station.name}</strong>
                    <small>
                      {station.line} · 중심에서{" "}
                      {Math.round(station.distanceMeters)}m
                    </small>
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <footer className="picker-footer">
          <div className="picker-selection">
            <span>선택한 지하철역</span>
            <strong>{selectedStations.length}개</strong>
          </div>
          <button
            className="primary-button"
            type="button"
            disabled={selectedStations.length === 0}
            onClick={() => onSave(selectedStations)}
          >
            선택한 {selectedStations.length}개 저장
          </button>
        </footer>
      </div>
    </div>
  );
}
