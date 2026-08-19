import { useCallback, type Dispatch, type SetStateAction } from "react";
import type { BusStop, CommuteDirection } from "../domain/bus";
import type {
  CommuteRouteOption,
  CommuteRouteOptionId,
} from "../domain/commute";
import type { SubwayStation } from "../domain/subway";
import type { CommuteStops } from "./commuteStopsStorage";
import { createRouteOptionId } from "./commuteStopsSelectors";

export function useCommuteRouteOptions(
  setCommutes: Dispatch<SetStateAction<CommuteStops>>,
) {
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
    [setCommutes],
  );

  const removeSubwayStation = useCallback(
    (
      direction: CommuteDirection,
      placeId: string,
      stationId: SubwayStation["id"],
    ) => {
      setCommutes((current) => ({
        ...current,
        [direction]: {
          ...current[direction],
          places: current[direction].places.map((place) => {
            if (place.id !== placeId) {
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
            return {
              ...place,
              subwayStations: place.subwayStations.filter(
                (station) => station.id !== stationId,
              ),
              routeOptions,
              activeRouteOptionId,
              selectedStopId:
                activeRoute?.startStopId ?? place.selectedStopId,
            };
          }),
        },
      }));
    },
    [setCommutes],
  );

  const addRouteOption = useCallback(
    (
      direction: CommuteDirection,
      placeId: string,
      startStopId: BusStop["id"],
      transferStationId: SubwayStation["id"] | null,
    ) => {
      setCommutes((current) => ({
        ...current,
        [direction]: {
          activePlaceId: placeId,
          places: current[direction].places.map((place) => {
            if (
              place.id !== placeId ||
              !place.stops.some((stop) => stop.id === startStopId) ||
              (transferStationId !== null &&
                !place.subwayStations.some(
                  (station) => station.id === transferStationId,
                ))
            ) {
              return place;
            }
            const existing = place.routeOptions.find(
              (option) =>
                option.startStopId === startStopId &&
                option.transferStationId === transferStationId,
            );
            if (existing) {
              return {
                ...place,
                activeRouteOptionId: existing.id,
                selectedStopId: existing.startStopId,
              };
            }
            const option: CommuteRouteOption = {
              id: createRouteOptionId(),
              startStopId,
              transferStationId,
            };
            return {
              ...place,
              routeOptions: [...place.routeOptions, option],
              activeRouteOptionId: option.id,
              selectedStopId: option.startStopId,
            };
          }),
        },
      }));
    },
    [setCommutes],
  );

  const removeRouteOption = useCallback(
    (
      direction: CommuteDirection,
      placeId: string,
      optionId: CommuteRouteOptionId,
    ) => {
      setCommutes((current) => ({
        ...current,
        [direction]: {
          ...current[direction],
          places: current[direction].places.map((place) => {
            if (place.id !== placeId) {
              return place;
            }
            const routeOptions = place.routeOptions.filter(
              (option) => option.id !== optionId,
            );
            const activeRouteOptionId =
              place.activeRouteOptionId === optionId
                ? (routeOptions[0]?.id ?? null)
                : place.activeRouteOptionId;
            const activeRoute = routeOptions.find(
              (option) => option.id === activeRouteOptionId,
            );
            return {
              ...place,
              routeOptions,
              activeRouteOptionId,
              selectedStopId:
                activeRoute?.startStopId ?? place.selectedStopId,
            };
          }),
        },
      }));
    },
    [setCommutes],
  );

  const selectRouteOption = useCallback(
    (
      direction: CommuteDirection,
      placeId: string,
      optionId: CommuteRouteOptionId,
    ) => {
      setCommutes((current) => ({
        ...current,
        [direction]: {
          activePlaceId: placeId,
          places: current[direction].places.map((place) => {
            const route = place.routeOptions.find(
              (option) => option.id === optionId,
            );
            return place.id === placeId && route
              ? {
                  ...place,
                  activeRouteOptionId: route.id,
                  selectedStopId: route.startStopId,
                }
              : place;
          }),
        },
      }));
    },
    [setCommutes],
  );

  return {
    addSubwayStations,
    removeSubwayStation,
    addRouteOption,
    removeRouteOption,
    selectRouteOption,
  } as const;
}
