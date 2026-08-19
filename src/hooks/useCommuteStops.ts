import { useCallback, useEffect, useState } from "react";
import type { BusStop, CommuteDirection } from "../domain/bus";
import {
  loadCommutes,
  saveCommutes,
  type CommutePlace,
  type CommuteStops,
} from "./commuteStopsStorage";
import { createPlaceId } from "./commuteStopsSelectors";
import { useCommuteRouteOptions } from "./useCommuteRouteOptions";

export {
  getActivePlace,
  getActiveRouteOption,
  getActiveStop,
} from "./commuteStopsSelectors";
export type {
  CommutePlace,
  DirectionCollection,
} from "./commuteStopsStorage";

export function useCommuteStops() {
  const [commutes, setCommutes] = useState<CommuteStops>(loadCommutes);
  const routeMutations = useCommuteRouteOptions(setCommutes);

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
      setCommutes((current) => ({
        ...current,
        [direction]: {
          ...current[direction],
          places: current[direction].places.map((place) => {
            if (place.id !== placeId) {
              return place;
            }
            const stops = place.stops.filter((stop) => stop.id !== stopId);
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
            };
          }),
        },
      }));
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

  return {
    commutes,
    addPlace,
    renamePlace,
    removePlace,
    selectPlace,
    addStop,
    removeStop,
    selectStop,
    ...routeMutations,
  } as const;
}
