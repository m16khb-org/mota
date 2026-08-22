import type { BusStop, CommuteDirection } from "../domain/bus";
import type { SavedCommuteProcedure } from "../domain/commute";
import type { SubwayStation } from "../domain/subway";
import type { CommutePlace, CommuteStops } from "./commuteStopsStorage";

/** Point-deletion transitions: removing a saved stop or station cascades
 * through favorites and procedures so no dangling reference survives. A
 * ready procedure never survives a dangling reference; an auto itinerary
 * drops only the deleted waypoint (the remaining itinerary stays valid
 * unless it empties). Selection ids fall back deterministically. */

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

function nextActiveProcedureId(
  place: CommutePlace,
  procedures: readonly SavedCommuteProcedure[],
) {
  return procedures.some(
    (procedure) => procedure.id === place.activeProcedureId,
  )
    ? place.activeProcedureId
    : (procedures[0]?.id ?? null);
}

/** Drops the deleted waypoint from auto itineraries (an emptied itinerary
 * is removed); ready procedures never survive a dangling reference. */
function filterStopReferences(
  procedures: readonly SavedCommuteProcedure[],
  stopId: BusStop["id"],
): SavedCommuteProcedure[] {
  const kept: SavedCommuteProcedure[] = [];
  for (const procedure of procedures) {
    switch (procedure.kind) {
      case "ready":
        if (!procedure.steps.some((step) => step.kind === "bus" && step.stopId === stopId)) {
          kept.push(procedure);
        }
        break;
      case "auto": {
        const points = procedure.points.filter(
          (point) => !(point.type === "stop" && point.stopId === stopId),
        );
        if (points.length > 0) {
          kept.push({ ...procedure, points });
        }
        break;
      }
    }
  }
  return kept;
}

function filterStationReferences(
  procedures: readonly SavedCommuteProcedure[],
  stationId: SubwayStation["id"],
): SavedCommuteProcedure[] {
  const kept: SavedCommuteProcedure[] = [];
  for (const procedure of procedures) {
    switch (procedure.kind) {
      case "ready":
        if (!procedure.steps.some((step) => step.kind === "subway" && step.stationId === stationId)) {
          kept.push(procedure);
        }
        break;
      case "auto": {
        const points = procedure.points.filter(
          (point) => !(point.type === "station" && point.stationId === stationId),
        );
        if (points.length > 0) {
          kept.push({ ...procedure, points });
        }
        break;
      }
    }
  }
  return kept;
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
    const favorites = place.favorites.filter(
      (favorite) => !(favorite.kind === "bus" && favorite.stopId === stopId),
    );
    const procedures = filterStopReferences(place.procedures, stopId);
    return {
      ...place,
      stops,
      selectedStopId:
        place.selectedStopId === stopId
          ? (stops[0]?.id ?? null)
          : place.selectedStopId,
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
    const favorites = place.favorites.filter(
      (favorite) =>
        !(favorite.kind === "subway" && favorite.stationId === stationId),
    );
    const procedures = filterStationReferences(place.procedures, stationId);
    return {
      ...place,
      subwayStations,
      selectedStopId: place.selectedStopId,
      favorites,
      procedures,
      activeProcedureId: nextActiveProcedureId(place, procedures),
    };
  });
}
