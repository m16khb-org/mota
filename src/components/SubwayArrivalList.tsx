import { BookmarkMinus, BookmarkPlus, RefreshCw, TrainFront } from "lucide-react";
import type {
  CommuteFavorite,
  SubwayCommuteFavorite,
} from "../domain/commute";
import type { SubwayArrival, SubwayStation } from "../domain/subway";
import type { CommuteFavoriteInput } from "../hooks/useCommuteProcedures";

const DEFAULT_ACCESS_MINUTES = 5;

interface SubwayFavoriteControls {
  readonly station: SubwayStation;
  readonly apiStationName: string;
  readonly favorites: readonly CommuteFavorite[];
  readonly onPinFavorite: (favorite: CommuteFavoriteInput) => void;
  readonly onUnpinFavorite: (favoriteId: SubwayCommuteFavorite["id"]) => void;
}

interface SubwayArrivalListProps {
  readonly stationName: string;
  readonly arrivals: readonly SubwayArrival[];
  readonly loading: boolean;
  readonly error: string | null;
  readonly updatedAt: string | null;
  readonly onClose: () => void;
  readonly onRefresh: () => void;
  /** Bound Task 3 mutations for the active direction and place. */
  readonly favoriteControls?: SubwayFavoriteControls;
}

function pinnedSubwayFavorite(
  arrival: SubwayArrival,
  controls: SubwayFavoriteControls,
): SubwayCommuteFavorite | null {
  for (const favorite of controls.favorites) {
    switch (favorite.kind) {
      case "bus":
        break;
      case "subway":
        if (
          favorite.stationId === controls.station.id &&
          favorite.apiStationName === controls.apiStationName &&
          favorite.subwayId === arrival.subwayId &&
          favorite.updnLine === arrival.updnLine
        ) {
          return favorite;
        }
        break;
    }
  }
  return null;
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
  onClose,
  onRefresh,
  favoriteControls,
}: SubwayArrivalListProps) {
  return (
    <section className="arrivals" aria-labelledby="subway-arrival-title">
      <div className="section-heading">
        <div>
          <span className="eyebrow">실시간 도착정보</span>
          <h2 id="subway-arrival-title">{stationName} 도착 예정</h2>
        </div>
        <div className="section-heading-actions">
          <button
            className="icon-button"
            type="button"
            onClick={onRefresh}
            disabled={loading}
            aria-label="지하철 도착정보 새로고침"
          >
            <RefreshCw aria-hidden="true" />
          </button>
          <button
            className="icon-button"
            type="button"
            onClick={onClose}
            aria-label="지하철 도착정보 닫기"
          >
            <TrainFront aria-hidden="true" />
          </button>
        </div>
      </div>

      <p className="refresh-status" aria-live="polite">
        {loading
          ? "실시간 정보를 불러오는 중입니다."
          : updatedAt
            ? `${formatUpdatedAt(updatedAt)} 기준`
            : "도착 예정 열차를 확인하는 중입니다."}
      </p>

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
        {arrivals.map((arrival) => {
          const pinned =
            favoriteControls === undefined
              ? null
              : pinnedSubwayFavorite(arrival, favoriteControls);
          return (
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
                        kind: "subway",
                        stationId: favoriteControls.station.id,
                        apiStationName: favoriteControls.apiStationName,
                        subwayId: arrival.subwayId,
                        updnLine: arrival.updnLine,
                        lineName: arrival.line,
                        trainLineNm: arrival.trainLineNm,
                        accessMinutes: DEFAULT_ACCESS_MINUTES,
                      });
                    }}
                    aria-label={`${arrival.line} · ${arrival.trainLineNm} 즐겨찾기 ${
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
