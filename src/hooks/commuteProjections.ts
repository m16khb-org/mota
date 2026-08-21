import type { BusStop } from "../domain/bus";
import type { SavedCommuteProcedure } from "../domain/commute";
import type { CommutePlace, DirectionCollection } from "./commuteStopsStorage";

/** Read-only queries over the saved aggregate. Projections never mutate and
 * never validate — storage owns the persisted shape, transitions own writes. */
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
