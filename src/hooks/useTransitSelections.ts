import { useCallback, useEffect, useState } from "react";
import type { BusStop } from "../domain/bus";
import type { SubwayStation } from "../domain/subway";
import {
  loadTransitSelections,
  saveTransitSelections,
  type TransitSelections,
} from "./transitSelectionStorage";

export function useTransitSelections() {
  const [selections, setSelections] =
    useState<TransitSelections>(loadTransitSelections);

  useEffect(() => {
    saveTransitSelections(selections);
  }, [selections]);

  const addBusStops = useCallback((stops: readonly BusStop[]) => {
    if (stops.length === 0) {
      return;
    }
    setSelections((current) => {
      const busStops = new Map(
        current.busStops.map((stop) => [stop.id, stop]),
      );
      for (const stop of stops) {
        busStops.set(stop.id, stop);
      }
      return {
        ...current,
        busStops: [...busStops.values()],
        selectedBusStopId: stops[0]?.id ?? current.selectedBusStopId,
      };
    });
  }, []);

  const addSubwayStations = useCallback(
    (stations: readonly SubwayStation[]) => {
      if (stations.length === 0) {
        return;
      }
      setSelections((current) => {
        const subwayStations = new Map(
          current.subwayStations.map((station) => [station.id, station]),
        );
        for (const station of stations) {
          subwayStations.set(station.id, station);
        }
        return {
          ...current,
          subwayStations: [...subwayStations.values()],
          selectedSubwayStationId:
            stations[0]?.id ?? current.selectedSubwayStationId,
        };
      });
    },
    [],
  );

  const selectBusStop = useCallback((stopId: BusStop["id"]) => {
    setSelections((current) =>
      current.busStops.some((stop) => stop.id === stopId)
        ? { ...current, selectedBusStopId: stopId }
        : current,
    );
  }, []);

  const selectSubwayStation = useCallback(
    (stationId: SubwayStation["id"]) => {
      setSelections((current) =>
        current.subwayStations.some((station) => station.id === stationId)
          ? { ...current, selectedSubwayStationId: stationId }
          : current,
      );
    },
    [],
  );

  const removeBusStop = useCallback((stopId: BusStop["id"]) => {
    setSelections((current) => {
      const busStops = current.busStops.filter((stop) => stop.id !== stopId);
      return {
        ...current,
        busStops,
        selectedBusStopId:
          current.selectedBusStopId === stopId
            ? (busStops[0]?.id ?? null)
            : current.selectedBusStopId,
      };
    });
  }, []);

  const removeSubwayStation = useCallback(
    (stationId: SubwayStation["id"]) => {
      setSelections((current) => {
        const subwayStations = current.subwayStations.filter(
          (station) => station.id !== stationId,
        );
        return {
          ...current,
          subwayStations,
          selectedSubwayStationId:
            current.selectedSubwayStationId === stationId
              ? (subwayStations[0]?.id ?? null)
              : current.selectedSubwayStationId,
        };
      });
    },
    [],
  );

  return {
    selections,
    addBusStops,
    addSubwayStations,
    selectBusStop,
    selectSubwayStation,
    removeBusStop,
    removeSubwayStation,
  } as const;
}
