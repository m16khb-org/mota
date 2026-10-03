import { CheckCircle2, MapPin, MapPinPlus, Trash2 } from "lucide-react";
import type { BusStop } from "../domain/bus";
interface TransitPointSelectorProps {
  readonly busStops: readonly BusStop[];
  readonly selectedBusStopIds: readonly BusStop["id"][];
  readonly searching: boolean;
  readonly onAdd: () => void;
  readonly onSelectBusStop: (stopId: BusStop["id"]) => void;
  readonly onRemoveBusStop: (stopId: BusStop["id"]) => void;
}

export function TransitPointSelector({
  busStops,
  selectedBusStopIds,
  searching,
  onAdd,
  onSelectBusStop,
  onRemoveBusStop,
}: TransitPointSelectorProps) {
  return (
    <section
      className={`point-selector${busStops.length > 0 ? " has-points" : ""}`}
      data-mode="bus"
      aria-labelledby="point-selector-title"
    >
      <div className="section-heading point-selector-heading">
        <div>
          <span className="eyebrow">어디서 탈까요?</span>
          <h2 id="point-selector-title">버스 정류장</h2>
        </div>
        <button
          id="point-search-trigger"
          className={`add-point-button${searching ? " is-active" : ""}`}
          type="button"
          aria-pressed={searching}
          onClick={onAdd}
        >
          <MapPinPlus aria-hidden="true" />
          {searching ? "찾기 취소" : "정류장 찾기"}
        </button>
      </div>

      {busStops.length === 0 ? (
        <div className="point-empty">
          <span className="point-empty-icon" aria-hidden="true">
            <MapPin />
          </span>
          <span>
            <strong>정류장을 저장해 보세요</strong>
            <small>가장 빠른 버스 3대를 바로 볼 수 있어요.</small>
          </span>
        </div>
      ) : (
        <div className="point-list">
          {busStops.map((stop) => {
            const selected = selectedBusStopIds.includes(stop.id);
            return (
              <div className={selected ? "point-row is-active" : "point-row"} key={stop.id}>
                <button
                  className="point-select"
                  type="button"
                  aria-pressed={selected}
                  onClick={() => onSelectBusStop(stop.id)}
                >
                  <span className="point-row-identity">
                    <strong>{stop.name}</strong>
                    <span className="point-row-detail">ARS {stop.arsId}</span>
                  </span>
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
          })}
        </div>
      )}
    </section>
  );
}
