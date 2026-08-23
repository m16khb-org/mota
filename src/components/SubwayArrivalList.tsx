import { RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";
import type { SubwayArrival } from "../domain/subway";

interface SubwayArrivalListProps {
  readonly stationName: string;
  readonly arrivals: readonly SubwayArrival[];
  readonly loading: boolean;
  readonly error: string | null;
  readonly updatedAt: string | null;
  readonly onRefresh: () => void;
}

interface DirectionOption {
  readonly key: string;
  readonly line: string;
  readonly updnLine: string;
}

function directionKey(arrival: SubwayArrival): string {
  return `${arrival.subwayId}:${arrival.updnLine}`;
}

function formatEta(seconds: number | null): string {
  if (seconds === null) {
    return "정보 없음";
  }
  if (seconds < 60) {
    return "곧 도착";
  }
  return `${Math.floor(seconds / 60)}분`;
}

function formatUpdatedAt(value: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Seoul",
  }).format(new Date(value));
}

export function SubwayArrivalList({
  stationName,
  arrivals,
  loading,
  error,
  updatedAt,
  onRefresh,
}: SubwayArrivalListProps) {
  const directions = useMemo(() => {
    const options = new Map<string, DirectionOption>();
    for (const arrival of arrivals) {
      const key = directionKey(arrival);
      if (!options.has(key)) {
        options.set(key, {
          key,
          line: arrival.line,
          updnLine: arrival.updnLine,
        });
      }
    }
    return [...options.values()];
  }, [arrivals]);
  const [selectedDirection, setSelectedDirection] = useState<string | null>(
    null,
  );
  const activeDirection = directions.some(
    (direction) => direction.key === selectedDirection,
  )
    ? selectedDirection
    : (directions[0]?.key ?? null);
  const visibleArrivals =
    activeDirection === null
      ? []
      : arrivals
          .filter((arrival) => directionKey(arrival) === activeDirection)
          .slice(0, 3);

  return (
    <section className="arrivals" aria-labelledby="subway-arrival-title">
      <div className="section-heading">
        <div>
          <span className="eyebrow">실시간 도착정보</span>
          <h2 id="subway-arrival-title">{stationName} 도착 예정</h2>
        </div>
        <button
          className="icon-button"
          type="button"
          onClick={onRefresh}
          disabled={loading}
          aria-label="지하철 도착정보 새로고침"
        >
          <RefreshCw aria-hidden="true" />
        </button>
      </div>

      <p className="refresh-status" aria-live="polite">
        {loading
          ? "실시간 정보를 불러오는 중입니다."
          : updatedAt
            ? `${formatUpdatedAt(updatedAt)} 기준`
            : "도착 예정 열차를 확인하는 중입니다."}
      </p>

      {directions.length > 0 ? (
        <div
          className="direction-tabs"
          role="tablist"
          aria-label="지하철 방향 선택"
        >
          {directions.map((direction) => (
            <button
              key={direction.key}
              type="button"
              role="tab"
              aria-selected={activeDirection === direction.key}
              tabIndex={activeDirection === direction.key ? 0 : -1}
              onClick={() => setSelectedDirection(direction.key)}
            >
              {direction.line} {direction.updnLine}
            </button>
          ))}
        </div>
      ) : null}

      {error ? (
        <div className="arrival-error" role="alert">
          <p>{error}</p>
          <button type="button" onClick={onRefresh}>
            다시 시도
          </button>
        </div>
      ) : null}

      {!loading && !error && arrivals.length === 0 ? (
        <p className="arrival-empty">현재 제공되는 도착 정보가 없습니다.</p>
      ) : null}

      {loading && arrivals.length === 0 ? (
        <div className="arrival-skeleton" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      ) : null}

      <div className="arrival-list">
        {visibleArrivals.map((arrival) => (
          <article
            className={`arrival-row is-subway${
              arrival.seconds === null ? " is-inactive" : ""
            }`}
            key={`${arrival.id}-${arrival.direction}-${arrival.message}`}
          >
            <div className="route-identity">
              <span className="subway-line-badge">{arrival.line}</span>
              <span className="subway-direction">{arrival.direction}</span>
            </div>
            <div className="arrival-meta">
              <span>{arrival.trainStatus}</span>
              {arrival.isLastTrain ? <span>막차</span> : null}
            </div>
            <div className="eta-block">
              <strong>{formatEta(arrival.seconds)}</strong>
              <span>{arrival.message}</span>
              {arrival.location ? (
                <small>{arrival.location} 부근</small>
              ) : null}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
