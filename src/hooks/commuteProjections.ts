import type { BusStop } from "../domain/bus";
import type {
  AutoCommuteProcedure,
  SavedCommuteProcedure,
} from "../domain/commute";
import type { ResolvedAutoPoint } from "../domain/autoCommuteEstimate";
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

/** Resolves an auto procedure's persisted point identities against the
 * place's saved stops/stations; unmatched points (transient states before a
 * cascade lands) are skipped so the derivation never sees a hole mid-leg. */
export function resolveAutoProcedurePoints(
  place: CommutePlace | null,
  procedure: AutoCommuteProcedure,
): readonly ResolvedAutoPoint[] {
  if (place === null) {
    return [];
  }
  const points: ResolvedAutoPoint[] = [];
  for (const point of procedure.points) {
    if (point.type === "stop") {
      const stop = place.stops.find((candidate) => candidate.id === point.stopId);
      if (stop) {
        points.push({
          pointId: stop.id,
          kind: "stop",
          name: stop.name,
          lat: stop.lat,
          lng: stop.lng,
          arsId: stop.arsId,
        });
      }
    } else {
      const station = place.subwayStations.find(
        (candidate) => candidate.id === point.stationId,
      );
      if (station) {
        points.push({
          pointId: station.id,
          kind: "station",
          name: station.name,
          lat: station.lat,
          lng: station.lng,
          apiStationName: point.apiStationName,
        });
      }
    }
  }
  return points;
}
