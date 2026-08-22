import type { CommuteFavorite } from "../domain/commute";
import {
  suggestBusRideMinutes,
  suggestSubwayRideMinutes,
  suggestWalkMinutes,
  type TravelPoint,
} from "../domain/commuteTravelTime";
import type { CommutePlace } from "../hooks/useCommuteStops";
import type { EditorStep } from "./commuteProcedureEditorState";

export type StepSuggestions = {
  /** Walk step: minutes between the previous and next transit points. */
  readonly walkMinutes: number | null;
  /** Transit step: ride minutes from this point to the next transit point. */
  readonly rideMinutes: number | null;
};

type PointLookup = (favorite: CommuteFavorite) => TravelPoint | null;

function pointLookupFor(place: CommutePlace): PointLookup {
  const stopPoints = new Map<string, TravelPoint>(
    place.stops.map((stop) => [stop.id, { lat: stop.lat, lng: stop.lng }]),
  );
  const stationPoints = new Map<string, TravelPoint>(
    place.subwayStations.map((station) => [
      station.id,
      { lat: station.lat, lng: station.lng },
    ]),
  );
  return (favorite) => {
    switch (favorite.kind) {
      case "bus":
        return stopPoints.get(favorite.stopId) ?? null;
      case "subway":
        return stationPoints.get(favorite.stationId) ?? null;
    }
  };
}

function resolvedPoint(
  step: EditorStep,
  favorites: readonly CommuteFavorite[],
  resolve: PointLookup,
): TravelPoint | null {
  if (step.kind === "walk") {
    return null;
  }
  const favorite = favorites.find((item) => item.id === step.favoriteId);
  return favorite === undefined ? null : resolve(favorite);
}

/** Nearest resolved transit point at or after `fromIndex`. */
function anchorAtOrAfter(
  steps: readonly EditorStep[],
  favorites: readonly CommuteFavorite[],
  resolve: PointLookup,
  fromIndex: number,
): TravelPoint | null {
  for (let index = fromIndex; index < steps.length; index += 1) {
    const step = steps[index];
    if (step === undefined) {
      continue;
    }
    const point = resolvedPoint(step, favorites, resolve);
    if (point !== null) {
      return point;
    }
  }
  return null;
}

/** Nearest resolved transit point strictly before `beforeIndex`. */
function anchorBefore(
  steps: readonly EditorStep[],
  favorites: readonly CommuteFavorite[],
  resolve: PointLookup,
  beforeIndex: number,
): TravelPoint | null {
  for (let index = beforeIndex - 1; index >= 0; index -= 1) {
    const step = steps[index];
    if (step === undefined) {
      continue;
    }
    const point = resolvedPoint(step, favorites, resolve);
    if (point !== null) {
      return point;
    }
  }
  return null;
}

/** Derives travel-minute suggestions from the geometry of the steps' saved
 * points. Legs without two anchors (first/last leg, unchosen favorite,
 * coincident points) get `null` and stay manual — never a fabricated value. */
export function suggestEditorMinutes(
  steps: readonly EditorStep[],
  place: CommutePlace,
): ReadonlyMap<string, StepSuggestions> {
  const resolve = pointLookupFor(place);
  const favorites = place.favorites;
  const result = new Map<string, StepSuggestions>();
  for (const [index, step] of steps.entries()) {
    const next = anchorAtOrAfter(steps, favorites, resolve, index + 1);
    switch (step.kind) {
      case "walk": {
        // Two consecutive walks cannot split one straight-line segment;
        // neither gets a fabricated value (both stay manual).
        const previousStep = steps[index - 1];
        const nextStep = steps[index + 1];
        const adjacentWalk =
          previousStep?.kind === "walk" || nextStep?.kind === "walk";
        const previous = anchorBefore(steps, favorites, resolve, index);
        result.set(step.id, {
          walkMinutes:
            adjacentWalk || previous === null || next === null
              ? null
              : suggestWalkMinutes(previous, next),
          rideMinutes: null,
        });
        break;
      }
      case "bus":
      case "subway": {
        const own = resolvedPoint(step, favorites, resolve);
        result.set(step.id, {
          walkMinutes: null,
          rideMinutes:
            own === null || next === null
              ? null
              : step.kind === "bus"
                ? suggestBusRideMinutes(own, next)
                : suggestSubwayRideMinutes(own, next),
        });
        break;
      }
    }
  }
  return result;
}
