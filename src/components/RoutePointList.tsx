import { MapPinned, TrainFront, Trash2 } from "lucide-react";
import type { BusStop } from "../domain/bus";
import type { SubwayStation } from "../domain/subway";
import type { CommutePlace } from "../hooks/useCommuteStops";

interface RoutePointListProps {
  readonly place: CommutePlace;
  readonly onSelectStop: (stopId: BusStop["id"]) => void;
  readonly onRemoveStop: (stopId: BusStop["id"]) => void;
  readonly onRemoveSubway: (stationId: SubwayStation["id"]) => void;
}

export function RoutePointList({
  place,
  onSelectStop,
  onRemoveStop,
  onRemoveSubway,
}: RoutePointListProps) {
  const pointCount = place.stops.length + place.subwayStations.length;

  return (
    <>
      <div className="saved-stop-heading">
        <h3>경로 지점</h3>
        <span>{pointCount}개 저장됨</span>
      </div>

      {pointCount > 0 ? (
        <div className="saved-stop-list">
          {place.stops.map((stop) => {
            const selected = stop.id === place.selectedStopId;
            return (
              <div
                key={stop.id}
                className={`saved-stop-row${selected ? " is-active" : ""}`}
              >
                <button
                  className="saved-stop-choice"
                  type="button"
                  aria-pressed={selected}
                  aria-label={`${stop.name} · ARS ${stop.arsId}`}
                  onClick={() => onSelectStop(stop.id)}
                >
                  <MapPinned aria-hidden="true" />
                  <span>
                    <strong>{stop.name}</strong>
                    <small>버스 · ARS {stop.arsId}</small>
                  </span>
                </button>
                <button
                  className="icon-button danger"
                  type="button"
                  onClick={() => onRemoveStop(stop.id)}
                  aria-label={`${stop.name} 정류장 삭제`}
                >
                  <Trash2 aria-hidden="true" />
                </button>
              </div>
            );
          })}

          {place.subwayStations.map((station) => (
            <div key={station.id} className="saved-stop-row is-subway">
              <div className="saved-stop-choice">
                <TrainFront aria-hidden="true" />
                <span>
                  <strong>{station.name}</strong>
                  <small>지하철 · {station.line}</small>
                </span>
              </div>
              <button
                className="icon-button danger"
                type="button"
                onClick={() => onRemoveSubway(station.id)}
                aria-label={`${station.name} 지하철역 삭제`}
              >
                <Trash2 aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="saved-stop-empty">등록한 버스 정류장이나 지하철역이 없습니다.</p>
      )}
    </>
  );
}
