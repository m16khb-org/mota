import { MapPinned, Plus, Route, Trash2 } from "lucide-react";
import { type SubmitEvent, useState } from "react";
import type { BusStop, CommuteDirection } from "../domain/bus";
import type {
  CommutePlace,
  DirectionCollection,
} from "../hooks/useCommuteStops";

interface CommutePlaceManagerProps {
  readonly direction: CommuteDirection;
  readonly collection: DirectionCollection;
  readonly activePlace: CommutePlace | null;
  readonly onAddPlace: (name: string) => void;
  readonly onRenamePlace: (placeId: string, name: string) => void;
  readonly onRemovePlace: (placeId: string) => void;
  readonly onSelectPlace: (placeId: string) => void;
  readonly onAddStop: () => void;
  readonly onRemoveStop: (stopId: BusStop["id"]) => void;
  readonly onSelectStop: (stopId: BusStop["id"]) => void;
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
  onRemoveStop,
  onSelectStop,
}: CommutePlaceManagerProps) {
  const copy = COPY[direction];
  const [newPlaceName, setNewPlaceName] = useState("");
  const [draftName, setDraftName] = useState(activePlace?.name ?? "");

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
        <fieldset className="place-selector">
          <legend className="sr-only">저장한 {copy.plural}</legend>
          {collection.places.map((place) => (
            <button
              key={place.id}
              className={place.id === activePlace?.id ? "is-active" : ""}
              type="button"
              aria-pressed={place.id === activePlace?.id}
              aria-label={`${place.name}, 정류장 ${place.stops.length}개`}
              onClick={() => onSelectPlace(place.id)}
            >
              <strong>{place.name}</strong>
              <span>정류장 {place.stops.length}개</span>
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

          <div className="saved-stop-heading">
            <h3>정류장</h3>
            <span>{activePlace.stops.length}개 저장됨</span>
          </div>

          {activePlace.stops.length > 0 ? (
            <div className="saved-stop-list">
              {activePlace.stops.map((stop) => {
                const selected = stop.id === activePlace.selectedStopId;
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
                        <small>ARS {stop.arsId}</small>
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
            </div>
          ) : (
            <p className="saved-stop-empty">등록한 정류장이 없습니다.</p>
          )}

          <button className="primary-button add-stop-button" type="button" onClick={onAddStop}>
            <Plus aria-hidden="true" />
            정류장 추가
          </button>
        </div>
      ) : null}
    </section>
  );
}
