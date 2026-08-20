import { Plus, Route, Trash2 } from "lucide-react";
import { type SubmitEvent, useEffect, useRef, useState } from "react";
import type { BusStop, CommuteDirection } from "../domain/bus";
import type { CommuteRouteOptionId } from "../domain/commute";
import type { SubwayStation } from "../domain/subway";
import type {
  CommutePlace,
  DirectionCollection,
} from "../hooks/useCommuteStops";
import { RoutePointList } from "./RoutePointList";
import { RouteComparison } from "./RouteComparison";

interface CommutePlaceManagerProps {
  readonly direction: CommuteDirection;
  readonly collection: DirectionCollection;
  readonly activePlace: CommutePlace | null;
  readonly onAddPlace: (name: string) => void;
  readonly onRenamePlace: (placeId: string, name: string) => void;
  readonly onRemovePlace: (placeId: string) => void;
  readonly onSelectPlace: (placeId: string) => void;
  readonly onAddStop: () => void;
  readonly onAddSubway: () => void;
  readonly onRemoveStop: (stopId: BusStop["id"]) => void;
  readonly onRemoveSubway: (stationId: SubwayStation["id"]) => void;
  readonly onSelectStop: (stopId: BusStop["id"]) => void;
  readonly onSelectSubway: (station: SubwayStation) => void;
  readonly selectedSubwayStationId: SubwayStation["id"] | null;
  readonly onAddRoute: (
    stopId: BusStop["id"],
    stationId: SubwayStation["id"] | null,
  ) => void;
  readonly onRemoveRoute: (optionId: CommuteRouteOptionId) => void;
  readonly onSelectRoute: (optionId: CommuteRouteOptionId) => void;
}

const COPY = {
  company: {
    eyebrow: "집 → 회사",
    plural: "회사",
    newName: "새 회사 이름",
    placeholder: "예: 강남 사무실",
  },
  home: {
    eyebrow: "회사 → 집",
    plural: "집",
    newName: "새 집 이름",
    placeholder: "예: 우리 집",
  },
} as const;

export function CommutePlaceManager({
  direction,
  collection,
  activePlace,
  onAddPlace,
  onRenamePlace,
  onRemovePlace,
  onSelectPlace,
  onAddStop,
  onAddSubway,
  onRemoveStop,
  onRemoveSubway,
  onSelectStop,
  onSelectSubway,
  selectedSubwayStationId,
  onAddRoute,
  onRemoveRoute,
  onSelectRoute,
}: CommutePlaceManagerProps) {
  const copy = COPY[direction];
  const activePlaceId = activePlace?.id ?? null;
  const placeSelectorRef = useRef<HTMLFieldSetElement>(null);
  const activePlaceButtonRef = useRef<HTMLButtonElement>(null);
  const [newPlaceName, setNewPlaceName] = useState("");
  const [draftName, setDraftName] = useState(activePlace?.name ?? "");

  useEffect(() => {
    if (!activePlaceId) {
      return;
    }
    const revealActivePlace = () =>
      activePlaceButtonRef.current?.scrollIntoView({
        block: "nearest",
        inline: "nearest",
      });
    revealActivePlace();
    window.addEventListener("resize", revealActivePlace);
    if (!placeSelectorRef.current || typeof ResizeObserver === "undefined") {
      return () => window.removeEventListener("resize", revealActivePlace);
    }
    const observer = new ResizeObserver(revealActivePlace);
    observer.observe(placeSelectorRef.current);
    return () => {
      window.removeEventListener("resize", revealActivePlace);
      observer.disconnect();
    };
  }, [activePlaceId]);

  const addPlace = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = newPlaceName.trim();
    if (!name) {
      return;
    }
    onAddPlace(name);
    setNewPlaceName("");
  };

  const saveName = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = draftName.trim();
    if (!activePlace || !name) {
      setDraftName(activePlace?.name ?? "");
      return;
    }
    onRenamePlace(activePlace.id, name);
  };

  return (
    <section className="commute-places" aria-labelledby="commute-places-title">
      <div className="section-heading">
        <div>
          <span className="eyebrow">{copy.eyebrow}</span>
          <h2 id="commute-places-title">
            내 {copy.plural} <span>{collection.places.length}</span>
          </h2>
        </div>
      </div>

      <form className="place-add-form" onSubmit={addPlace}>
        <input
          type="text"
          value={newPlaceName}
          onChange={(event) => setNewPlaceName(event.target.value)}
          aria-label={copy.newName}
          placeholder={copy.placeholder}
        />
        <button className="secondary-button" type="submit">
          <Plus aria-hidden="true" />
          {copy.plural} 추가
        </button>
      </form>

      {collection.places.length > 0 ? (
        <fieldset ref={placeSelectorRef} className="place-selector">
          <legend className="sr-only">저장한 {copy.plural}</legend>
          {collection.places.map((place) => (
            <button
              key={place.id}
              ref={place.id === activePlaceId ? activePlaceButtonRef : undefined}
              className={place.id === activePlace?.id ? "is-active" : ""}
              type="button"
              aria-pressed={place.id === activePlace?.id}
              aria-label={`${place.name}, 루트 ${place.routeOptions.length}개`}
              onClick={() => onSelectPlace(place.id)}
            >
              <strong>{place.name}</strong>
              <span>루트 {place.routeOptions.length}개</span>
            </button>
          ))}
        </fieldset>
      ) : (
        <div className="place-empty">
          <Route aria-hidden="true" />
          <p>먼저 자주 가는 {copy.plural}을 추가하세요.</p>
        </div>
      )}

      {activePlace ? (
        <div className="place-detail">
          <div className="place-detail-heading">
            <form onSubmit={saveName}>
              <input
                type="text"
                value={draftName}
                onChange={(event) => setDraftName(event.target.value)}
                aria-label={`선택한 ${copy.plural} 이름`}
              />
              <button type="submit">이름 저장</button>
            </form>
            <button
              className="icon-button danger"
              type="button"
              onClick={() => onRemovePlace(activePlace.id)}
              aria-label={`${activePlace.name} 삭제`}
            >
              <Trash2 aria-hidden="true" />
            </button>
          </div>

          <RoutePointList
            place={activePlace}
            selectedSubwayStationId={selectedSubwayStationId}
            onSelectStop={onSelectStop}
            onSelectSubway={onSelectSubway}
            onRemoveStop={onRemoveStop}
            onRemoveSubway={onRemoveSubway}
          />

          <div className="route-add-actions">
            <button
              className="primary-button"
              type="button"
              onClick={onAddStop}
            >
              <Plus aria-hidden="true" />
              버스 정류장 추가
            </button>
            <button
              className="secondary-button"
              type="button"
              onClick={onAddSubway}
            >
              <Plus aria-hidden="true" />
              지하철역 추가
            </button>
          </div>

          <RouteComparison
            place={activePlace}
            onAdd={onAddRoute}
            onRemove={onRemoveRoute}
            onSelect={onSelectRoute}
          />
        </div>
      ) : null}
    </section>
  );
}
