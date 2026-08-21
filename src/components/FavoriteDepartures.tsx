import { CircleAlert, Pencil, PinOff, RefreshCw, Save, X } from "lucide-react";
import { type SubmitEventHandler, useId, useState } from "react";
import type { BusArrival } from "../domain/bus";
import type { CommuteFavorite, CommuteFavoriteId } from "../domain/commute";
import { snapshotBasis, type LiveSnapshot } from "../domain/liveCommuteQueries";
import type { SubwayArrival } from "../domain/subway";
import type { CommuteFavoriteInput } from "../hooks/useCommuteProcedures";

interface FavoriteDeparturesProps {
  /** Favorites already selected for the active direction and place. */
  readonly favorites: readonly CommuteFavorite[];
  readonly snapshots: ReadonlyMap<string, LiveSnapshot>;
  readonly now: number;
  /** Optional manual refresh of the whole live query set (App wires the
   * refresh controller here; absent in isolated component tests). */
  readonly onRefresh?: () => void;
  readonly onUpdateFavorite: (
    favoriteId: CommuteFavoriteId,
    favorite: CommuteFavoriteInput,
  ) => void;
  readonly onUnpinFavorite: (favoriteId: CommuteFavoriteId) => void;
}

interface FavoriteCardProps extends Omit<FavoriteDeparturesProps, "favorites"> {
  readonly favorite: CommuteFavorite;
}

type Departure = { readonly seconds: number; readonly message: string };
type Arrivals = readonly (BusArrival | SubwayArrival)[];

function assertNever(value: never): never {
  throw new TypeError(`Unexpected favorite: ${JSON.stringify(value)}`);
}

function serviceText(value: string): string {
  return value.normalize("NFC").trim().replace(/\s+/g, " ");
}

function favoriteName(favorite: CommuteFavorite): string {
  switch (favorite.kind) {
    case "bus":
      return `${favorite.routeName} · ${favorite.direction}`;
    case "subway":
      return `${favorite.lineName} · ${favorite.trainLineNm}`;
    default:
      return assertNever(favorite);
  }
}

/** Identity split for display: the separator belongs to the direction unit
 * (joined by a no-break space) so narrow cards wrap BETWEEN route and
 * direction, never leaving a detached trailing `·`. */
function favoriteIdentity(
  favorite: CommuteFavorite,
): { readonly route: string; readonly direction: string } {
  switch (favorite.kind) {
    case "bus":
      return { route: favorite.routeName, direction: favorite.direction };
    case "subway":
      return { route: favorite.lineName, direction: favorite.trainLineNm };
    default:
      return assertNever(favorite);
  }
}

function sourceFor(
  favorite: CommuteFavorite,
  snapshots: ReadonlyMap<string, LiveSnapshot>,
): LiveSnapshot | null {
  switch (favorite.kind) {
    case "bus": {
      const source = snapshots.get(`bus:${favorite.arsId}`);
      return source?.query.kind === "bus" && source.query.args.arsId === favorite.arsId &&
        source.query.stopIds.includes(favorite.stopId) ? source : null;
    }
    case "subway": {
      const source = snapshots.get(`subway:${favorite.apiStationName}`);
      return source?.query.kind === "subway" &&
        source.query.args.station === favorite.apiStationName &&
        source.query.stationIds.includes(favorite.stationId) ? source : null;
    }
    default:
      return assertNever(favorite);
  }
}

function matchingDepartures(
  favorite: CommuteFavorite,
  source: LiveSnapshot | null,
  now: number,
): readonly Departure[] {
  if (source === null || source.lastSuccess === null) return [];
  const departures: Departure[] = [];
  const arrivals: Arrivals = source.lastSuccess.arrivals;
  switch (favorite.kind) {
    case "bus": {
      const direction = serviceText(favorite.direction);
      for (const arrival of arrivals) {
        if (!("routeId" in arrival) || arrival.routeId !== favorite.routeId ||
          serviceText(arrival.direction) !== direction) continue;
        for (const estimate of [arrival.first, arrival.second]) {
          if (estimate !== null && estimate.seconds !== null) {
            departures.push({ seconds: estimate.seconds, message: estimate.message });
          }
        }
      }
      break;
    }
    case "subway":
      for (const arrival of arrivals) {
        if (!("subwayId" in arrival) || arrival.subwayId !== favorite.subwayId ||
          arrival.updnLine !== favorite.updnLine || arrival.seconds === null) continue;
        departures.push({ seconds: arrival.seconds, message: arrival.message });
      }
      break;
    default:
      return assertNever(favorite);
  }
  const elapsed = Math.max(0, Math.floor((now - source.lastSuccess.updatedAt) / 1_000));
  return departures.filter((departure) => departure.seconds >= elapsed).sort(
    (left, right) => left.seconds - right.seconds || left.message.localeCompare(right.message, "ko"),
  ).slice(0, 2);
}

function displayDeparture(message: string): string {
  return message
    .replace(/(\d+)\s*분\s*후/g, "$1분 후")
    .replace(/(\d+)\s*초\s*후/g, "$1초 후");
}

function sourceStatus(source: LiveSnapshot | null, now: number): string {
  if (source === null) return "정보 없음";
  if (source.latestAttemptStatus === "failure") {
    return source.lastSuccess === null ? "갱신 실패 · 정보 없음" : "갱신 실패 · 오래된 정보";
  }
  const basis = snapshotBasis(source, now);
  switch (basis) {
    case "live":
      return source.latestAttemptStatus === "pending" ? "갱신 중" : "실시간";
    case "stale":
      return "오래된 정보";
    case "unavailable":
      return "정보 없음";
    default:
      return assertNever(basis);
  }
}

function guidance(
  departure: Departure | undefined,
  source: LiveSnapshot | null,
  favorite: CommuteFavorite,
  now: number,
): string | null {
  if (departure === undefined || source === null || source.lastSuccess === null ||
    snapshotBasis(source, now) !== "live" || source.latestAttemptStatus === "failure") return null;
  const elapsed = Math.max(0, Math.floor((now - source.lastSuccess.updatedAt) / 1_000));
  const minutes = Math.floor((departure.seconds - elapsed - favorite.accessMinutes * 60) / 60);
  return minutes > 0 ? `${minutes}분 후 출발` : "지금 출발";
}

function FavoriteDepartureCard({
  favorite,
  snapshots,
  now,
  onUpdateFavorite,
  onUnpinFavorite,
}: FavoriteCardProps) {
  const [editing, setEditing] = useState(false);
  const [accessDraft, setAccessDraft] = useState(String(favorite.accessMinutes));
  const source = sourceFor(favorite, snapshots);
  const departures = matchingDepartures(favorite, source, now);
  const failure = source?.latestAttemptStatus === "failure";
  const stale = source !== null && (failure || snapshotBasis(source, now) === "stale");
  const name = favoriteName(favorite);
  const identity = favoriteIdentity(favorite);
  const leave = guidance(departures[0], source, favorite, now);

  const saveAccess: SubmitEventHandler<HTMLFormElement> = (event) => {
    event.preventDefault();
    const accessMinutes = Number(accessDraft);
    if (!Number.isInteger(accessMinutes) || accessMinutes < 1) return;
    const { id, ...input } = favorite;
    onUpdateFavorite(id, { ...input, accessMinutes });
    setEditing(false);
  };

  return (
    <article className={`favorite-departure${stale ? " is-stale" : ""}${failure ? " has-failure" : ""}`}>
      <div className="favorite-departure-heading">
        <div>
          <strong className="favorite-identity">
            <span>{identity.route}</span>{" "}
            <span className="favorite-direction">·&nbsp;{identity.direction}</span>
          </strong>
          <span>{source?.lastSuccess ? `${formatUpdatedAt(source.lastSuccess.updatedAt)} 기준` : "도착 정보 없음"}</span>
        </div>
        <span className={`favorite-status${failure ? " has-failure" : ""}`} role={failure ? "alert" : undefined}>
          {failure ? <CircleAlert aria-hidden="true" /> : null}
          {sourceStatus(source, now)}
        </span>
      </div>
      {departures.length > 0 ? (
        <ol className="favorite-departure-times">
          {departures.map((departure, index) => (
            <li key={`${departure.seconds}-${departure.message}`}>
              {index === 0 ? (
                <strong className="favorite-primary-eta">{displayDeparture(departure.message)}</strong>
              ) : <span className="favorite-secondary-eta">{displayDeparture(departure.message)}</span>}
              {index === 0 && leave !== null ? <span className="favorite-guidance">{leave}</span> : null}
            </li>
          ))}
        </ol>
      ) : <p className="favorite-no-departure">이 방면 도착 예정 없음</p>}
      {editing ? (
        <form className="favorite-access-form" onSubmit={saveAccess}>
          <label>
            <span className="sr-only">{name} 접근 시간</span>
            <input aria-label={`${name} 접근 시간`} inputMode="numeric" min="1" onChange={(event) => setAccessDraft(event.target.value)} type="number" value={accessDraft} />
          </label>
          <span>분</span>
          <button className="icon-button" type="submit" aria-label="저장"><Save aria-hidden="true" /></button>
          <button className="icon-button" type="button" onClick={() => { setAccessDraft(String(favorite.accessMinutes)); setEditing(false); }} aria-label="접근 시간 수정 취소"><X aria-hidden="true" /></button>
        </form>
      ) : (
        <div className="favorite-departure-actions">
          <span>접근 {favorite.accessMinutes}분</span>
          <button className="secondary-button" type="button" onClick={() => setEditing(true)} aria-label={`${name} 접근 시간 수정`}><Pencil aria-hidden="true" />수정</button>
          <button className="icon-button danger" type="button" onClick={() => onUnpinFavorite(favorite.id)} aria-label={`${name} 즐겨찾기 해제`}><PinOff aria-hidden="true" /></button>
        </div>
      )}
    </article>
  );
}

function formatUpdatedAt(updatedAt: number): string {
  return new Intl.DateTimeFormat("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Seoul" }).format(new Date(updatedAt));
}

export function FavoriteDepartures(props: FavoriteDeparturesProps) {
  const headingId = useId();
  const { favorites, snapshots, now, onRefresh, onUpdateFavorite, onUnpinFavorite } = props;
  if (favorites.length === 0) return null;
  return (
    <section className="favorite-departures" aria-labelledby={headingId}>
      <div className="section-heading">
        <div>
          <span className="eyebrow">저장한 정확한 노선</span>
          <h2 id={headingId}>즐겨찾기 출발</h2>
        </div>
        {onRefresh ? (
          <button
            className="icon-button"
            type="button"
            onClick={onRefresh}
            aria-label="즐겨찾기 도착정보 새로고침"
          >
            <RefreshCw aria-hidden="true" />
          </button>
        ) : null}
      </div>
      <div className="favorite-departure-list">
        {favorites.map((favorite) => <FavoriteDepartureCard key={favorite.id} favorite={favorite} snapshots={snapshots} now={now} onUpdateFavorite={onUpdateFavorite} onUnpinFavorite={onUnpinFavorite} />)}
      </div>
    </section>
  );
}
