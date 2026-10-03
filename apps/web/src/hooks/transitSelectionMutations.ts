import {
  MAX_SELECTED_BUS_STOPS,
  type CommuteContext,
  type TransitPointSelections,
  type TransitSelections,
} from "@mota/contracts/transit-settings";
import type { BusStop } from "../domain/bus";

function updateCommute(
  selections: TransitSelections,
  commute: CommuteContext,
  transition: (current: TransitPointSelections) => TransitPointSelections,
): TransitSelections {
  return {
    commutes: {
      ...selections.commutes,
      [commute]: transition(selections.commutes[commute]),
    },
  };
}

export function addBusStopsToCommute(
  selections: TransitSelections,
  commute: CommuteContext,
  stops: readonly BusStop[],
): TransitSelections {
  if (stops.length === 0) {
    return selections;
  }
  return updateCommute(selections, commute, (pointSelections) => {
    const busStops = new Map(pointSelections.busStops.map((stop) => [stop.id, stop]));
    for (const stop of stops) {
      busStops.set(stop.id, stop);
    }
    return {
      ...pointSelections,
      busStops: [...busStops.values()],
      selectedBusStopIds: [
        ...new Set([...pointSelections.selectedBusStopIds, ...stops.map((stop) => stop.id)]),
      ].slice(0, MAX_SELECTED_BUS_STOPS),
    };
  });
}

export function toggleBusStopForCommute(
  selections: TransitSelections,
  commute: CommuteContext,
  stopId: BusStop["id"],
): TransitSelections {
  return updateCommute(selections, commute, (pointSelections) => {
    if (!pointSelections.busStops.some((stop) => stop.id === stopId)) {
      return pointSelections;
    }
    const selectedBusStopIds = pointSelections.selectedBusStopIds.includes(stopId)
      ? pointSelections.selectedBusStopIds.filter((id) => id !== stopId)
      : [...pointSelections.selectedBusStopIds, stopId].slice(0, MAX_SELECTED_BUS_STOPS);
    return { ...pointSelections, selectedBusStopIds };
  });
}

export function removeBusStopFromCommute(
  selections: TransitSelections,
  commute: CommuteContext,
  stopId: BusStop["id"],
): TransitSelections {
  return updateCommute(selections, commute, (pointSelections) => ({
    ...pointSelections,
    busStops: pointSelections.busStops.filter((stop) => stop.id !== stopId),
    selectedBusStopIds: pointSelections.selectedBusStopIds.filter((id) => id !== stopId),
  }));
}
