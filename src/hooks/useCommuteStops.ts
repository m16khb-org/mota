import { useCallback, useEffect, useState } from "react";
import type { BusStop, CommuteDirection } from "../domain/bus";
import type { SubwayStation } from "../domain/subway";
import {
  loadCommutes,
  saveCommutes,
  type CommutePlace,
  type CommuteStops,
} from "./commuteStopsStorage";
import { createPlaceId, removeStopFromCommutes, removeSubwayStationFromCommutes } from "./commuteStopsSelectors";
import { useCommuteProcedures } from "./useCommuteProcedures";

export {
  getActivePlace,
  getActiveProcedure,
  getActiveStop,
} from "./commuteStopsSelectors";
export type {
  CommutePlace,
  DirectionCollection,
} from "./commuteStopsStorage";

export function useCommuteStops() {
  const [commutes, setCommutes] = useState<CommuteStops>(loadCommutes);
  const mutations = useCommuteProcedures(setCommutes);

  useEffect(() => {
    saveCommutes(commutes);
  }, [commutes]);

  const addPlace = useCallback(
    (direction: CommuteDirection, name: string) => {
      const trimmedName = name.trim();
      if (!trimmedName) {
        return;
      }
      const place: CommutePlace = {
        id: createPlaceId(direction),
        name: trimmedName,
        stops: [],
        subwayStations: [],
        selectedStopId: null,
        routeOptions: [],
        activeRouteOptionId: null,
        procedures: [],
        favorites: [],
        activeProcedureId: null,
      };
      setCommutes((current) => ({
        ...current,
        [direction]: {
          places: [...current[direction].places, place],
          activePlaceId: place.id,
        },
      }));
    },
    [],
  );

  const renamePlace = useCallback(
    (direction: CommuteDirection, placeId: string, name: string) => {
      const trimmedName = name.trim();
      if (!trimmedName) {
        return;
      }
      setCommutes((current) => ({
        ...current,
        [direction]: {
          ...current[direction],
          places: current[direction].places.map((place) =>
            place.id === placeId ? { ...place, name: trimmedName } : place,
          ),
        },
      }));
    },
    [],
  );

  const removePlace = useCallback(
    (direction: CommuteDirection, placeId: string) => {
      setCommutes((current) => {
        const collection = current[direction];
        const places = collection.places.filter((place) => place.id !== placeId);
        return {
          ...current,
          [direction]: {
            places,
            activePlaceId:
              collection.activePlaceId === placeId
                ? (places[0]?.id ?? null)
                : collection.activePlaceId,
          },
        };
      });
    },
    [],
  );

  const selectPlace = useCallback(
    (direction: CommuteDirection, placeId: string) => {
      setCommutes((current) => ({
        ...current,
        [direction]: {
          ...current[direction],
          activePlaceId: current[direction].places.some(
            (place) => place.id === placeId,
          )
            ? placeId
            : current[direction].activePlaceId,
        },
      }));
    },
    [],
  );

  const addStop = useCallback(
    (direction: CommuteDirection, placeId: string, stop: BusStop) => {
      setCommutes((current) => ({
        ...current,
        [direction]: {
          activePlaceId: placeId,
          places: current[direction].places.map((place) => {
            if (place.id !== placeId) {
              return place;
            }
            const alreadySaved = place.stops.some(
              (savedStop) => savedStop.id === stop.id,
            );
            return {
              ...place,
              stops: alreadySaved ? place.stops : [...place.stops, stop],
              selectedStopId: stop.id,
            };
          }),
        },
      }));
    },
    [],
  );

  const removeStop = useCallback(
    (
      direction: CommuteDirection,
      placeId: string,
      stopId: BusStop["id"],
    ) => {
      setCommutes((current) =>
        removeStopFromCommutes(current, direction, placeId, stopId),
      );
    },
    [],
  );

  const selectStop = useCallback(
    (
      direction: CommuteDirection,
      placeId: string,
      stopId: BusStop["id"],
    ) => {
      setCommutes((current) => ({
        ...current,
        [direction]: {
          activePlaceId: placeId,
          places: current[direction].places.map((place) => {
            if (
              place.id !== placeId ||
              !place.stops.some((stop) => stop.id === stopId)
            ) {
              return place;
            }
            const route = place.routeOptions.find(
              (option) => option.startStopId === stopId,
            );
            return {
              ...place,
              selectedStopId: stopId,
              activeRouteOptionId: route?.id ?? place.activeRouteOptionId,
            };
          }),
        },
      }));
    },
    [],
  );

  const addSubwayStations = useCallback(
    (
      direction: CommuteDirection,
      placeId: string,
      stations: readonly SubwayStation[],
    ) => {
      setCommutes((current) => ({
        ...current,
        [direction]: {
          activePlaceId: placeId,
          places: current[direction].places.map((place) => {
            if (place.id !== placeId) {
              return place;
            }
            const merged = new Map(
              place.subwayStations.map((station) => [station.id, station]),
            );
            for (const station of stations) {
              merged.set(station.id, station);
            }
            return { ...place, subwayStations: [...merged.values()] };
          }),
        },
      }));
    },
    [],
  );

  const removeSubwayStation = useCallback(
    (
      direction: CommuteDirection,
      placeId: string,
      stationId: SubwayStation["id"],
    ) => {
      setCommutes((current) =>
        removeSubwayStationFromCommutes(
          current,
          direction,
          placeId,
          stationId,
        ),
      );
    },
    [],
  );

  return {
    commutes,
    addPlace,
    renamePlace,
    removePlace,
    selectPlace,
    addStop,
    removeStop,
    selectStop,
    addSubwayStations,
    removeSubwayStation,
    ...mutations,
  } as const;
}
