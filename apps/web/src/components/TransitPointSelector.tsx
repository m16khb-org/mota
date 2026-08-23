import {
  BusFront,
  CheckCircle2,
  MapPin,
  MapPinPlus,
  TrainFront,
  Trash2,
} from "lucide-react";
import type { KeyboardEvent } from "react";
import type { BusStop } from "../domain/bus";
import { stationDisplayLine, type SubwayStation } from "../domain/subway";

export type TransitMode = "bus" | "subway";

interface TransitPointSelectorProps {
  readonly mode: TransitMode;
  readonly busStops: readonly BusStop[];
  readonly subwayStations: readonly SubwayStation[];
  readonly selectedBusStopId: BusStop["id"] | null;
  readonly selectedSubwayStationId: SubwayStation["id"] | null;
  readonly onModeChange: (mode: TransitMode) => void;
  readonly onAdd: () => void;
  readonly onSelectBusStop: (stopId: BusStop["id"]) => void;
  readonly onSelectSubwayStation: (stationId: SubwayStation["id"]) => void;
  readonly onRemoveBusStop: (stopId: BusStop["id"]) => void;
  readonly onRemoveSubwayStation: (stationId: SubwayStation["id"]) => void;
}

function nextMode(
  event: KeyboardEvent<HTMLButtonElement>,
  mode: TransitMode,
): TransitMode | null {
  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
    return null;
  }
  return mode === "bus" ? "subway" : "bus";
}

export function TransitPointSelector({
  mode,
  busStops,
  subwayStations,
  selectedBusStopId,
  selectedSubwayStationId,
  onModeChange,
  onAdd,
  onSelectBusStop,
  onSelectSubwayStation,
  onRemoveBusStop,
  onRemoveSubwayStation,
}: TransitPointSelectorProps) {
  const points = mode === "bus" ? busStops : subwayStations;
  const label = mode === "bus" ? "정류장" : "역";
  const heading = mode === "bus" ? "버스 정류장" : "지하철역";

  return (
    <section
      className={`point-selector${points.length > 0 ? " has-points" : ""}`}
      aria-labelledby="point-selector-title"
    >
      <div
        className="transit-tabs"
        role="tablist"
        aria-label="교통수단 선택"
      >
        {(["bus", "subway"] as const).map((tabMode) => (
          <button
            key={tabMode}
            id={`transit-tab-${tabMode}`}
            className="transit-tab"
            type="button"
            role="tab"
            aria-selected={mode === tabMode}
            tabIndex={mode === tabMode ? 0 : -1}
            onClick={() => onModeChange(tabMode)}
            onKeyDown={(event) => {
              const targetMode = nextMode(event, tabMode);
              if (targetMode === null) {
                return;
              }
              event.preventDefault();
              onModeChange(targetMode);
              document.getElementById(`transit-tab-${targetMode}`)?.focus();
            }}
          >
            {tabMode === "bus" ? (
              <BusFront aria-hidden="true" />
            ) : (
              <TrainFront aria-hidden="true" />
            )}
            {tabMode === "bus" ? "버스" : "지하철"}
          </button>
        ))}
      </div>

      <div className="section-heading point-selector-heading">
        <div>
          <span className="eyebrow">어디서 탈까요?</span>
          <h2 id="point-selector-title">{heading}</h2>
        </div>
        <button className="add-point-button" type="button" onClick={onAdd}>
          <MapPinPlus aria-hidden="true" />
          {label} 찾기
        </button>
      </div>

      {points.length === 0 ? (
        <div className="point-empty">
          <span className="point-empty-icon" aria-hidden="true">
            {mode === "bus" ? <MapPin /> : <TrainFront />}
          </span>
          <span>
            <strong>
              {mode === "bus" ? "정류장을 저장해 보세요" : "역을 저장해 보세요"}
            </strong>
            <small>
              {mode === "bus"
                ? "가장 빠른 버스 3대를 바로 볼 수 있어요."
                : "방향별 다음 열차 3대를 바로 볼 수 있어요."}
            </small>
          </span>
        </div>
      ) : (
        <div className="point-list">
          {mode === "bus"
            ? busStops.map((stop) => {
                const selected = stop.id === selectedBusStopId;
                return (
                  <div className={selected ? "point-row is-active" : "point-row"} key={stop.id}>
                    <button
                      className="point-select"
                      type="button"
                      aria-pressed={selected}
                      onClick={() => onSelectBusStop(stop.id)}
                    >
                      <strong>{stop.name}</strong>
                      <span>ARS {stop.arsId}</span>
                      {selected ? (
                        <small className="point-current">
                          <CheckCircle2 aria-hidden="true" /> 지금 보는 곳
                        </small>
                      ) : null}
                    </button>
                    <button
                      className="point-remove"
                      type="button"
                      aria-label={`${stop.name} 정류장 삭제`}
                      onClick={() => onRemoveBusStop(stop.id)}
                    >
                      <Trash2 aria-hidden="true" />
                    </button>
                  </div>
                );
              })
            : subwayStations.map((station) => {
                const selected = station.id === selectedSubwayStationId;
                return (
                  <div
                    className={selected ? "point-row is-active" : "point-row"}
                    key={station.id}
                  >
                    <button
                      className="point-select"
                      type="button"
                      aria-pressed={selected}
                      onClick={() => onSelectSubwayStation(station.id)}
                    >
                      <strong>{station.name}</strong>
                      <span>{stationDisplayLine(station)}</span>
                      {selected ? (
                        <small className="point-current">
                          <CheckCircle2 aria-hidden="true" /> 지금 보는 곳
                        </small>
                      ) : null}
                    </button>
                    <button
                      className="point-remove"
                      type="button"
                      aria-label={`${station.name}역 삭제`}
                      onClick={() => onRemoveSubwayStation(station.id)}
                    >
                      <Trash2 aria-hidden="true" />
                    </button>
                  </div>
                );
              })}
        </div>
      )}
    </section>
  );
}
