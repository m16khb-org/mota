import type { z } from "zod";
import type { BusStop, CommuteDirection } from "../domain/bus";
import {
  CommuteFavoriteIdSchema,
  CommuteProcedureIdSchema,
  type CommuteFavorite,
  type CommuteFavoriteId,
  type CommuteProcedure,
  type CommuteProcedureId,
  type SavedCommuteProcedure,
} from "../domain/commute";
import type { commuteFavoriteSchema, commuteProcedureSchema } from "../domain/commute";
import type { SubwayStation } from "../domain/subway";
import type {
  CommutePlace,
  CommuteStops,
  DirectionCollection,
} from "./commuteStopsStorage";

/** Unbranded input shapes accepted by the hook mutations; the Zod schemas in
 * `src/domain/commute.ts` stay the single validation boundary. */
type DistributiveOmit<T, K extends keyof never> = T extends unknown
  ? Omit<T, K>
  : never;

export type CommuteProcedureInput = DistributiveOmit<
  z.input<typeof commuteProcedureSchema>,
  "id" | "kind"
>;
export type CommuteFavoriteInput = DistributiveOmit<
  z.input<typeof commuteFavoriteSchema>,
  "id"
>;

function createRandomIdPart(): string {
  const random = new Uint32Array(2);
  globalThis.crypto.getRandomValues(random);
  const [first = 0, second = 0] = random;
  return `${first.toString(36)}${second.toString(36)}`;
}

export function createPlaceId(direction: CommuteDirection): string {
  return `${direction}-${createRandomIdPart()}`;
}

export function createProcedureId(): CommuteProcedureId {
  return CommuteProcedureIdSchema.parse(`proc-${createRandomIdPart()}`);
}

export function createFavoriteId(): CommuteFavoriteId {
  return CommuteFavoriteIdSchema.parse(`fav-${createRandomIdPart()}`);
}

export function getActivePlace(
  collection: DirectionCollection,
): CommutePlace | null {
  return (
    collection.places.find((place) => place.id === collection.activePlaceId) ??
    null
  );
}

export function getActiveStop(place: CommutePlace | null): BusStop | null {
  return (
    place?.stops.find((stop) => stop.id === place.selectedStopId) ?? null
  );
}

export function getActiveProcedure(
  place: CommutePlace | null,
): SavedCommuteProcedure | null {
  return (
    place?.procedures.find(
      (procedure) => procedure.id === place.activeProcedureId,
    ) ?? null
  );
}

/** Exact favorite identity: display labels never participate. */
export function favoriteIdentityKey(favorite: CommuteFavorite): string {
  return favorite.kind === "bus"
    ? `bus:${favorite.stopId}:${favorite.routeId}:${favorite.direction}`
    : `subway:${favorite.stationId}:${favorite.subwayId}:${favorite.updnLine}`;
}

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
      (candidate) =>
        candidate.kind === "ready" &&
        procedureContentKey(candidate) === contentKey,
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

function removeStopReferences(
  procedures: readonly SavedCommuteProcedure[],
  stopId: BusStop["id"],
): SavedCommuteProcedure[] {
  const next: SavedCommuteProcedure[] = [];
  for (const procedure of procedures) {
    if (procedure.kind === "legacy-draft") {
      if (procedure.stopId !== stopId) {
        next.push(procedure);
        continue;
      }
      if (procedure.stationId === null) {
        // No surviving referenced point: the draft cannot be kept.
        continue;
      }
      next.push({ ...procedure, stopId: null });
      continue;
    }
    const referencesStop = procedure.steps.some(
      (step) => step.kind === "bus" && step.stopId === stopId,
    );
    // A ready procedure never survives a dangling stop reference, and it is
    // never silently demoted to a draft.
    if (!referencesStop) {
      next.push(procedure);
    }
  }
  return next;
}

function removeStationReferences(
  procedures: readonly SavedCommuteProcedure[],
  stationId: SubwayStation["id"],
): SavedCommuteProcedure[] {
  const next: SavedCommuteProcedure[] = [];
  for (const procedure of procedures) {
    if (procedure.kind === "legacy-draft") {
      if (procedure.stationId !== stationId) {
        next.push(procedure);
        continue;
      }
      if (procedure.stopId === null) {
        continue;
      }
      next.push({ ...procedure, stationId: null });
      continue;
    }
    const referencesStation = procedure.steps.some(
      (step) => step.kind === "subway" && step.stationId === stationId,
    );
    if (!referencesStation) {
      next.push(procedure);
    }
  }
  return next;
}

export function removeStopFromCommutes(
  commutes: CommuteStops,
  direction: CommuteDirection,
  placeId: string,
  stopId: BusStop["id"],
): CommuteStops {
  return mapPlace(commutes, direction, placeId, (place) => {
    const stops = place.stops.filter((stop) => stop.id !== stopId);
    if (stops.length === place.stops.length) {
      return place;
    }
    const routeOptions = place.routeOptions.filter(
      (option) => option.startStopId !== stopId,
    );
    const activeRouteOptionId = routeOptions.some(
      (option) => option.id === place.activeRouteOptionId,
    )
      ? place.activeRouteOptionId
      : (routeOptions[0]?.id ?? null);
    const activeRoute = routeOptions.find(
      (option) => option.id === activeRouteOptionId,
    );
    const favorites = place.favorites.filter(
      (favorite) => !(favorite.kind === "bus" && favorite.stopId === stopId),
    );
    const procedures = removeStopReferences(place.procedures, stopId);
    return {
      ...place,
      stops,
      routeOptions,
      activeRouteOptionId,
      selectedStopId:
        activeRoute?.startStopId ??
        (place.selectedStopId === stopId
          ? (stops[0]?.id ?? null)
          : place.selectedStopId),
      favorites,
      procedures,
      activeProcedureId: nextActiveProcedureId(place, procedures),
    };
  });
}

export function removeSubwayStationFromCommutes(
  commutes: CommuteStops,
  direction: CommuteDirection,
  placeId: string,
  stationId: SubwayStation["id"],
): CommuteStops {
  return mapPlace(commutes, direction, placeId, (place) => {
    const subwayStations = place.subwayStations.filter(
      (station) => station.id !== stationId,
    );
    if (subwayStations.length === place.subwayStations.length) {
      return place;
    }
    const routeOptions = place.routeOptions.filter(
      (option) => option.transferStationId !== stationId,
    );
    const activeRouteOptionId = routeOptions.some(
      (option) => option.id === place.activeRouteOptionId,
    )
      ? place.activeRouteOptionId
      : (routeOptions[0]?.id ?? null);
    const activeRoute = routeOptions.find(
      (option) => option.id === activeRouteOptionId,
    );
    const favorites = place.favorites.filter(
      (favorite) =>
        !(favorite.kind === "subway" && favorite.stationId === stationId),
    );
    const procedures = removeStationReferences(place.procedures, stationId);
    return {
      ...place,
      subwayStations,
      routeOptions,
      activeRouteOptionId,
      selectedStopId: activeRoute?.startStopId ?? place.selectedStopId,
      favorites,
      procedures,
      activeProcedureId: nextActiveProcedureId(place, procedures),
    };
  });
}
