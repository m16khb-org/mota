import type { CommuteDirection } from "../domain/bus";
import type {
  CommuteFavorite,
  CommuteFavoriteId,
  CommuteProcedure,
  CommuteProcedureId,
  SavedCommuteProcedure,
} from "../domain/commute";
import { favoriteIdentityKey } from "./commuteIdentity";
import type {
  CommutePlace,
  CommuteStops,
} from "./commuteStopsStorage";

/** Aggregate state transitions. Every mutation of the saved commute
 * collection goes through here so the invariants — procedures must reference
 * saved points, ready procedures never survive dangling references, favorites
 * dedupe by exact identity — hold for every caller. Functions are pure:
 * they return a new aggregate and never read the clock, storage, or network. */

function mapPlace(
  commutes: CommuteStops,
  direction: CommuteDirection,
  placeId: string,
  update: (place: CommutePlace) => CommutePlace,
): CommuteStops {
  return {
    ...commutes,
    [direction]: {
      ...commutes[direction],
      places: commutes[direction].places.map((place) =>
        place.id === placeId ? update(place) : place,
      ),
    },
  };
}

function activatePlace(
  commutes: CommuteStops,
  direction: CommuteDirection,
  placeId: string,
): CommuteStops {
  const collection = commutes[direction];
  if (!collection.places.some((place) => place.id === placeId)) {
    return commutes;
  }
  return {
    ...commutes,
    [direction]: { ...collection, activePlaceId: placeId },
  };
}

function procedureReferencesSavedPoints(
  place: CommutePlace,
  procedure: CommuteProcedure,
): boolean {
  const stopIds = new Set(place.stops.map((stop) => stop.id));
  const stationIds = new Set(place.subwayStations.map((station) => station.id));
  return procedure.steps.every((step) =>
    step.kind === "walk"
      ? true
      : step.kind === "bus"
        ? stopIds.has(step.stopId)
        : stationIds.has(step.stationId),
  );
}

function procedureContentKey(procedure: CommuteProcedure): string {
  return JSON.stringify({ name: procedure.name, steps: procedure.steps });
}

function nextActiveProcedureId(
  place: CommutePlace,
  procedures: readonly SavedCommuteProcedure[],
): CommuteProcedureId | null {
  return procedures.some(
    (procedure) => procedure.id === place.activeProcedureId,
  )
    ? place.activeProcedureId
    : (procedures[0]?.id ?? null);
}

export function addProcedureToCommutes(
  commutes: CommuteStops,
  direction: CommuteDirection,
  placeId: string,
  procedure: CommuteProcedure,
): CommuteStops {
  const updated = mapPlace(commutes, direction, placeId, (place) => {
    if (!procedureReferencesSavedPoints(place, procedure)) {
      return place;
    }
    const contentKey = procedureContentKey(procedure);
    const existing = place.procedures.find(
      (candidate) => procedureContentKey(candidate) === contentKey,
    );
    if (existing) {
      return { ...place, activeProcedureId: existing.id };
    }
    return {
      ...place,
      procedures: [...place.procedures, procedure],
      activeProcedureId: procedure.id,
    };
  });
  return activatePlace(updated, direction, placeId);
}

export function editProcedureInCommutes(
  commutes: CommuteStops,
  direction: CommuteDirection,
  placeId: string,
  procedureId: CommuteProcedureId,
  procedure: CommuteProcedure,
): CommuteStops {
  return mapPlace(commutes, direction, placeId, (place) => {
    if (
      !place.procedures.some((candidate) => candidate.id === procedureId) ||
      !procedureReferencesSavedPoints(place, procedure)
    ) {
      return place;
    }
    return {
      ...place,
      procedures: place.procedures.map((candidate) =>
        candidate.id === procedureId
          ? { ...procedure, id: procedureId }
          : candidate,
      ),
    };
  });
}

export function removeProcedureFromCommutes(
  commutes: CommuteStops,
  direction: CommuteDirection,
  placeId: string,
  procedureId: CommuteProcedureId,
): CommuteStops {
  return mapPlace(commutes, direction, placeId, (place) => {
    const procedures = place.procedures.filter(
      (candidate) => candidate.id !== procedureId,
    );
    if (procedures.length === place.procedures.length) {
      return place;
    }
    return {
      ...place,
      procedures,
      activeProcedureId: nextActiveProcedureId(place, procedures),
    };
  });
}

export function reorderProcedureInCommutes(
  commutes: CommuteStops,
  direction: CommuteDirection,
  placeId: string,
  procedureId: CommuteProcedureId,
  toIndex: number,
): CommuteStops {
  return mapPlace(commutes, direction, placeId, (place) => {
    const fromIndex = place.procedures.findIndex(
      (candidate) => candidate.id === procedureId,
    );
    if (fromIndex === -1) {
      return place;
    }
    const targetIndex = Math.min(
      Math.max(Math.trunc(toIndex), 0),
      place.procedures.length - 1,
    );
    if (fromIndex === targetIndex) {
      return place;
    }
    const procedures = [...place.procedures];
    const [moved] = procedures.splice(fromIndex, 1);
    if (!moved) {
      return place;
    }
    procedures.splice(targetIndex, 0, moved);
    return { ...place, procedures };
  });
}

export function selectProcedureInCommutes(
  commutes: CommuteStops,
  direction: CommuteDirection,
  placeId: string,
  procedureId: CommuteProcedureId,
): CommuteStops {
  const collection = commutes[direction];
  const place = collection.places.find((candidate) => candidate.id === placeId);
  if (!place?.procedures.some((candidate) => candidate.id === procedureId)) {
    return commutes;
  }
  const updated = mapPlace(commutes, direction, placeId, (candidate) => ({
    ...candidate,
    activeProcedureId: procedureId,
  }));
  return activatePlace(updated, direction, placeId);
}

export function pinFavoriteInCommutes(
  commutes: CommuteStops,
  direction: CommuteDirection,
  placeId: string,
  favorite: CommuteFavorite,
): CommuteStops {
  const updated = mapPlace(commutes, direction, placeId, (place) => {
    const referencesSavedPoint =
      favorite.kind === "bus"
        ? place.stops.some((stop) => stop.id === favorite.stopId)
        : place.subwayStations.some(
            (station) => station.id === favorite.stationId,
          );
    if (!referencesSavedPoint) {
      return place;
    }
    const identity = favoriteIdentityKey(favorite);
    const alreadyPinned = place.favorites.some(
      (candidate) => favoriteIdentityKey(candidate) === identity,
    );
    if (alreadyPinned) {
      return place;
    }
    return { ...place, favorites: [...place.favorites, favorite] };
  });
  return activatePlace(updated, direction, placeId);
}

export function unpinFavoriteFromCommutes(
  commutes: CommuteStops,
  direction: CommuteDirection,
  placeId: string,
  favoriteId: CommuteFavoriteId,
): CommuteStops {
  return mapPlace(commutes, direction, placeId, (place) => ({
    ...place,
    favorites: place.favorites.filter(
      (candidate) => candidate.id !== favoriteId,
    ),
  }));
}

export function updateFavoriteInCommutes(
  commutes: CommuteStops,
  direction: CommuteDirection,
  placeId: string,
  favoriteId: CommuteFavoriteId,
  favorite: CommuteFavorite,
): CommuteStops {
  return mapPlace(commutes, direction, placeId, (place) => {
    if (!place.favorites.some((candidate) => candidate.id === favoriteId)) {
      return place;
    }
    const identity = favoriteIdentityKey(favorite);
    const identityTaken = place.favorites.some(
      (candidate) =>
        candidate.id !== favoriteId &&
        favoriteIdentityKey(candidate) === identity,
    );
    const referencesSavedPoint =
      favorite.kind === "bus"
        ? place.stops.some((stop) => stop.id === favorite.stopId)
        : place.subwayStations.some(
            (station) => station.id === favorite.stationId,
          );
    if (identityTaken || !referencesSavedPoint) {
      return place;
    }
    return {
      ...place,
      favorites: place.favorites.map((candidate) =>
        candidate.id === favoriteId
          ? { ...favorite, id: favoriteId }
          : candidate,
      ),
    };
  });
}
