import { RefreshCw, Route, Trash2 } from "lucide-react";
import { useEffect, useState, type SubmitEvent } from "react";
import type { BusStop } from "../domain/bus";
import type { CommuteRouteOptionId } from "../domain/commute";
import type { RankedRouteWait } from "../domain/routeComparison";
import type { SubwayStation } from "../domain/subway";
import type { CommutePlace } from "../hooks/useCommuteStops";

interface RouteOptionListProps {
  readonly place: CommutePlace;
  readonly waits: readonly RankedRouteWait[];
  readonly onAdd: (
    startStopId: BusStop["id"],
    transferStationId: SubwayStation["id"] | null,
  ) => void;
  readonly onRemove: (optionId: CommuteRouteOptionId) => void;
  readonly onSelect: (optionId: CommuteRouteOptionId) => void;
  readonly onRefresh: () => void;
}

export function RouteOptionList(_props: RouteOptionListProps) {
  const { place, waits, onAdd, onRemove, onSelect, onRefresh } = _props;
  const [startStopId, setStartStopId] = useState<string>(
    place.stops[0]?.id ?? "",
  );
  const [transferStationId, setTransferStationId] = useState<string>(
    place.subwayStations[0]?.id ?? "",
  );

  useEffect(() => {
    setStartStopId((current) =>
      place.stops.some((stop) => stop.id === current)
        ? current
        : (place.stops[0]?.id ?? ""),
    );
    setTransferStationId((current) =>
      current === "" ||
      place.subwayStations.some((station) => station.id === current)
        ? current
        : (place.subwayStations[0]?.id ?? ""),
    );
  }, [place.stops, place.subwayStations]);

  const saveRoute = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const stop = place.stops.find((candidate) => candidate.id === startStopId);
    const station =
      transferStationId === ""
        ? null
        : (place.subwayStations.find(
            (candidate) => candidate.id === transferStationId,
          ) ?? null);
    if (stop && (transferStationId === "" || station)) {
      onAdd(stop.id, station?.id ?? null);
    }
  };

  return (
    <section className="route-options" aria-labelledby="route-options-title">
      <div className="section-heading route-options-heading">
        <div>
          <span className="eyebrow">버스 도착 대기 기준</span>
          <h3 id="route-options-title">통근 루트 비교</h3>
        </div>
        <div className="route-options-actions">
          <span>{place.routeOptions.length}개 저장됨</span>
          <button
            className="icon-button"
            type="button"
            onClick={onRefresh}
            disabled={place.routeOptions.length === 0}
            aria-label="루트 도착정보 새로고침"
          >
            <RefreshCw aria-hidden="true" />
          </button>
        </div>
      </div>

      {place.stops.length > 0 ? (
        <form className="route-option-form" onSubmit={saveRoute}>
          <label>
            <span>출발 정류장</span>
            <select
              value={startStopId}
              onChange={(event) => setStartStopId(event.target.value)}
            >
              {place.stops.map((stop) => (
                <option key={stop.id} value={stop.id}>
                  {stop.name} · {stop.arsId}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>환승역</span>
            <select
              value={transferStationId}
              onChange={(event) => setTransferStationId(event.target.value)}
            >
              <option value="">환승 없음</option>
              {place.subwayStations.map((station) => (
                <option key={station.id} value={station.id}>
                  {station.name} · {station.line}
                </option>
              ))}
            </select>
          </label>
          <div className="route-destination">
            <span>목적지</span>
            <strong>{place.name}</strong>
          </div>
          <button className="secondary-button" type="submit">
            루트 저장
          </button>
        </form>
      ) : (
        <div className="route-option-empty">
          <Route aria-hidden="true" />
          <p>비교할 출발 정류장을 먼저 추가하세요.</p>
        </div>
      )}

      {place.routeOptions.length > 0 ? (
        <div className="route-option-list">
          {place.routeOptions.map((option) => {
            const stop = place.stops.find(
              (candidate) => candidate.id === option.startStopId,
            );
            const station = place.subwayStations.find(
              (candidate) => candidate.id === option.transferStationId,
            );
            if (!stop) {
              return null;
            }
            const wait = waits.find((candidate) => candidate.id === option.id);
            return (
              <article
                key={option.id}
                className={
                  option.id === place.activeRouteOptionId
                    ? "route-option is-active"
                    : "route-option"
                }
              >
                <button
                  className="route-option-main"
                  type="button"
                  aria-pressed={option.id === place.activeRouteOptionId}
                  onClick={() => onSelect(option.id)}
                >
                  <span className="route-path">
                    <strong>{stop.name}</strong>
                    <span aria-hidden="true">→</span>
                    {station ? <strong>{station.name}</strong> : null}
                    {station ? <span aria-hidden="true">→</span> : null}
                    <strong>{place.name}</strong>
                  </span>
                  <span className="route-wait">
                    {wait?.rank === 1 ? <b>지금 출발 추천</b> : null}
                    {wait?.seconds !== null && wait?.seconds !== undefined ? (
                      <strong>{Math.max(1, Math.ceil(wait.seconds / 60))}분</strong>
                    ) : (
                      <span className={wait?.failed ? "is-error" : undefined}>
                        {wait?.failed
                          ? "불러오기 실패 · 새로고침"
                          : wait?.fresh
                          ? "현재 도착 정보 없음"
                          : "도착 정보 확인 중"}
                      </span>
                    )}
                    {wait?.routeName ? <small>{wait.routeName}</small> : null}
                  </span>
                </button>
                <button
                  className="icon-button danger"
                  type="button"
                  onClick={() => onRemove(option.id)}
                  aria-label={`${stop.name} 출발 루트 삭제`}
                >
                  <Trash2 aria-hidden="true" />
                </button>
              </article>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
