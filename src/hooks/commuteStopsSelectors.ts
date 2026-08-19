import type { BusStop, CommuteDirection } from "../domain/bus";
import {
  CommuteRouteOptionIdSchema,
  type CommuteRouteOption,
  type CommuteRouteOptionId,
} from "../domain/commute";
import type {
  CommutePlace,
  DirectionCollection,
} from "./commuteStopsStorage";

export function createPlaceId(direction: CommuteDirection): string {
  const random = new Uint32Array(2);
  window.crypto.getRandomValues(random);
  const [first = 0, second = 0] = random;
  return `${direction}-${first.toString(36)}${second.toString(36)}`;
}

export function createRouteOptionId(): CommuteRouteOptionId {
  const random = new Uint32Array(2);
  window.crypto.getRandomValues(random);
  const [first = 0, second = 0] = random;
  return CommuteRouteOptionIdSchema.parse(
    `route-${first.toString(36)}${second.toString(36)}`,
  );
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

export function getActiveRouteOption(
  place: CommutePlace | null,
): CommuteRouteOption | null {
  return (
    place?.routeOptions.find(
      (option) => option.id === place.activeRouteOptionId,
    ) ?? null
  );
}
