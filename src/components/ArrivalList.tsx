import {
  Accessibility,
  ArrowRight,
  BookmarkMinus,
  BookmarkPlus,
  Gauge,
  RefreshCw,
} from "lucide-react";
import type { BusArrival, BusStop } from "../domain/bus";
import type { BusCommuteFavorite, CommuteFavorite } from "../domain/commute";
import type { CommuteFavoriteInput } from "../hooks/useCommuteProcedures";

const DEFAULT_ACCESS_MINUTES = 5;

interface BusFavoriteControls {
  readonly stop: BusStop;
  readonly favorites: readonly CommuteFavorite[];
  readonly onPinFavorite: (favorite: CommuteFavoriteInput) => void;
  readonly onUnpinFavorite: (favoriteId: BusCommuteFavorite["id"]) => void;
}

interface ArrivalListProps {
  readonly arrivals: readonly BusArrival[];
  readonly loading: boolean;
  readonly error: string | null;
  readonly updatedAt: string | null;
  readonly hasStop: boolean;
  readonly onRefresh: () => void;
  /** Bound Task 3 mutations for the active direction and place. */
  readonly favoriteControls?: BusFavoriteControls;
}
function normalizeServiceText(value: string): string {
  return value.normalize("NFC").trim().replace(/\s+/g, " ");
}

function pinnedBusFavorite(
  arrival: BusArrival,
  controls: BusFavoriteControls,
): BusCommuteFavorite | null {
  const direction = normalizeServiceText(arrival.direction);
  for (const favorite of controls.favorites) {
    switch (favorite.kind) {
      case "bus":
        if (
          favorite.stopId === controls.stop.id &&
          favorite.arsId === controls.stop.arsId &&
          favorite.routeId === arrival.routeId &&
          favorite.direction === direction
        ) {
          return favorite;
        }
        break;
      case "subway":
        break;
    }
  }
  return null;
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

function formatArrivalMessage(message: string): string {
  return message
    .replace(/(\d+)\s*분\s*후/g, "$1분 후")
    .replace(/(\d+)\s*초\s*후/g, "$1초 후");
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
  favoriteControls,
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
        {arrivals.map((arrival) => {
          const pinned =
            favoriteControls === undefined
              ? null
              : pinnedBusFavorite(arrival, favoriteControls);
          const normalizedDirection = normalizeServiceText(arrival.direction);
          return (
            <article
              className={`arrival-row${
                arrival.first.seconds === null ? " is-inactive" : ""
              }`}
              key={`${arrival.routeId}-${normalizedDirection}`}
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
                <span>{formatArrivalMessage(arrival.first.message)}</span>
                {arrival.second ? <small>다음 {formatArrivalMessage(arrival.second.message)}</small> : null}
              </div>
              {favoriteControls ? (
                <div className="arrival-row-actions">
                  <button
                    className="arrival-favorite-toggle"
                    type="button"
                    onClick={() => {
                      if (pinned) {
                        favoriteControls.onUnpinFavorite(pinned.id);
                        return;
                      }
                      favoriteControls.onPinFavorite({
                        kind: "bus",
                        stopId: favoriteControls.stop.id,
                        arsId: favoriteControls.stop.arsId,
                        routeId: arrival.routeId,
                        routeName: arrival.routeName,
                        direction: normalizedDirection,
                        accessMinutes: DEFAULT_ACCESS_MINUTES,
                      });
                    }}
                    aria-label={`${arrival.routeName} ${normalizedDirection} 즐겨찾기 ${
                      pinned ? "해제" : "추가"
                    }`}
                  >
                    {pinned ? (
                      <BookmarkMinus aria-hidden="true" />
                    ) : (
                      <BookmarkPlus aria-hidden="true" />
                    )}
                    {pinned ? "해제" : "저장"}
                  </button>
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}
