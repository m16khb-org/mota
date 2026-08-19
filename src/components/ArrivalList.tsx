import { Accessibility, ArrowRight, Gauge, RefreshCw } from "lucide-react";
import type { BusArrival } from "../domain/bus";

interface ArrivalListProps {
  readonly arrivals: readonly BusArrival[];
  readonly loading: boolean;
  readonly error: string | null;
  readonly updatedAt: string | null;
  readonly hasStop: boolean;
  readonly onRefresh: () => void;
}
function formatEta(seconds: number | null, fallback: string): string {
  if (seconds === null) {
    return fallback;
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

export function ArrivalList({
  arrivals,
  loading,
  error,
  updatedAt,
  hasStop,
  onRefresh,
}: ArrivalListProps) {
  return (
    <section className="arrivals" aria-labelledby="arrival-title">
      <div className="section-heading">
        <div>
          <span className="eyebrow">실시간 도착정보</span>
          <h2 id="arrival-title">도착 예정</h2>
        </div>
        <button
          className="icon-button"
          type="button"
          onClick={onRefresh}
          disabled={!hasStop || loading}
          aria-label="도착정보 새로고침"
        >
          <RefreshCw aria-hidden="true" />
        </button>
      </div>

      <p className="refresh-status" aria-live="polite">
        {loading
          ? "실시간 정보를 불러오는 중입니다."
          : updatedAt
            ? `${formatUpdatedAt(updatedAt)} 기준`
            : "정류장을 선택하면 실시간 정보가 표시됩니다."}
      </p>

      {error ? (
        <div className="arrival-error" role="alert">
          <p>{error}</p>
          <button type="button" onClick={onRefresh}>
            다시 시도
          </button>
        </div>
      ) : null}

      {!loading && hasStop && !error && arrivals.length === 0 ? (
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
        {arrivals.map((arrival) => (
          <article
            className={`arrival-row${
              arrival.first.seconds === null ? " is-inactive" : ""
            }`}
            key={arrival.routeId}
          >
            <div className="route-identity">
              <strong>{arrival.routeName}</strong>
              <span>
                {arrival.direction} <ArrowRight aria-hidden="true" />
              </span>
            </div>
            <div className="arrival-meta">
              {arrival.lowFloor ? (
                <span title="저상버스">
                  <Accessibility aria-hidden="true" /> 저상
                </span>
              ) : null}
              {arrival.first.congestion ? (
                <span>
                  <Gauge aria-hidden="true" /> {arrival.first.congestion}
                </span>
              ) : null}
            </div>
            <div className="eta-block">
              <strong>{formatEta(arrival.first.seconds, arrival.first.message)}</strong>
              <span>{arrival.first.message}</span>
              {arrival.second ? <small>다음 {arrival.second.message}</small> : null}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
