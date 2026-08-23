import { useCallback, useEffect, useRef, useState } from "react";
import {
  MAX_SELECTED_BUS_STOPS,
  type TransitSelections,
} from "@mota/contracts/transit-settings";
import {
  fetchTransitSettings,
  saveTransitSettings,
} from "../api/client";
import type { BusStop } from "../domain/bus";
import type { SubwayStation } from "../domain/subway";
import {
  loadTransitSelections,
  saveTransitSelections,
} from "./transitSelectionStorage";
import type { GatewaySessionState } from "./useGatewaySession";

export type TransitSyncStatus =
  | "local"
  | "loading"
  | "saving"
  | "synced"
  | "error";

export function useTransitSelections(session: GatewaySessionState) {
  const [selections, setSelections] =
    useState<TransitSelections>(loadTransitSelections);
  const [syncStatus, setSyncStatus] =
    useState<TransitSyncStatus>("local");
  const selectionsRef = useRef(selections);
  const sessionRef = useRef(session);
  const generationRef = useRef(0);
  const mutationRef = useRef(0);
  const activeUserRef = useRef<string | null>(null);
  const hydratedRef = useRef(false);
  const versionRef = useRef(0);
  const hydratedSnapshotRef = useRef<TransitSelections | null>(null);
  const saveChainRef = useRef<Promise<void>>(Promise.resolve());
  sessionRef.current = session;

  const replaceSelections = useCallback((next: TransitSelections) => {
    selectionsRef.current = next;
    setSelections(next);
  }, []);

  useEffect(() => {
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    hydratedRef.current = false;
    versionRef.current = 0;
    saveChainRef.current = Promise.resolve();

    if (!session.checked) {
      setSyncStatus("local");
      return;
    }
    if (!session.authenticated || !session.user) {
      activeUserRef.current = null;
      replaceSelections(loadTransitSelections());
      setSyncStatus("local");
      return;
    }

    const authUserId = session.user.sub;
    activeUserRef.current = authUserId;
    const mutationAtStart = mutationRef.current;
    setSyncStatus("loading");

    void fetchTransitSettings()
      .then(async (snapshot) => {
        if (
          generationRef.current !== generation ||
          activeUserRef.current !== authUserId
        ) {
          return;
        }
        if (
          snapshot.selections !== null &&
          mutationRef.current === mutationAtStart
        ) {
          versionRef.current = snapshot.version;
          hydratedRef.current = true;
          hydratedSnapshotRef.current = snapshot.selections;
          replaceSelections(snapshot.selections);
          setSyncStatus("synced");
          return;
        }

        const saved = await saveTransitSettings({
          version: snapshot.version,
          selections: selectionsRef.current,
        });
        if (
          generationRef.current !== generation ||
          activeUserRef.current !== authUserId
        ) {
          return;
        }
        versionRef.current = saved.version;
        hydratedRef.current = true;
        setSyncStatus("synced");
      })
      .catch(() => {
        if (
          generationRef.current === generation &&
          activeUserRef.current === authUserId
        ) {
          setSyncStatus("error");
        }
      });
  }, [
    replaceSelections,
    session.authenticated,
    session.checked,
    session.user,
  ]);

  useEffect(() => {
    selectionsRef.current = selections;
    if (
      !session.authenticated ||
      !session.user ||
      !hydratedRef.current ||
      activeUserRef.current !== session.user.sub
    ) {
      return;
    }
    if (hydratedSnapshotRef.current === selections) {
      hydratedSnapshotRef.current = null;
      return;
    }

    const generation = generationRef.current;
    const authUserId = session.user.sub;
    const nextSelections = selections;
    setSyncStatus("saving");
    saveChainRef.current = saveChainRef.current
      .then(async () => {
        if (
          generationRef.current !== generation ||
          activeUserRef.current !== authUserId
        ) {
          return;
        }
        const saved = await saveTransitSettings({
          version: versionRef.current,
          selections: nextSelections,
        });
        if (
          generationRef.current === generation &&
          activeUserRef.current === authUserId
        ) {
          versionRef.current = saved.version;
          setSyncStatus("synced");
        }
      })
      .catch(() => {
        if (
          generationRef.current === generation &&
          activeUserRef.current === authUserId
        ) {
          setSyncStatus("error");
        }
      });
  }, [selections, session.authenticated, session.user]);

  const mutate = useCallback(
    (transition: (current: TransitSelections) => TransitSelections) => {
      const next = transition(selectionsRef.current);
      selectionsRef.current = next;
      mutationRef.current += 1;
      setSelections(next);
      if (!sessionRef.current.authenticated) {
        saveTransitSelections(next);
      }
    },
    [],
  );

  const addBusStops = useCallback(
    (stops: readonly BusStop[]) => {
      if (stops.length === 0) {
        return;
      }
      mutate((current) => {
        const busStops = new Map(
          current.busStops.map((stop) => [stop.id, stop]),
        );
        for (const stop of stops) {
          busStops.set(stop.id, stop);
        }
        const selectedBusStopIds = [
          ...new Set([
            ...current.selectedBusStopIds,
            ...stops.map((stop) => stop.id),
          ]),
        ].slice(0, MAX_SELECTED_BUS_STOPS);
        return {
          ...current,
          busStops: [...busStops.values()],
          selectedBusStopIds,
        };
      });
    },
    [mutate],
  );

  const addSubwayStations = useCallback(
    (stations: readonly SubwayStation[]) => {
      if (stations.length === 0) {
        return;
      }
      mutate((current) => {
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
    [mutate],
  );

  const toggleBusStop = useCallback(
    (stopId: BusStop["id"]) => {
      mutate((current) => {
        if (!current.busStops.some((stop) => stop.id === stopId)) {
          return current;
        }
        const selectedBusStopIds = current.selectedBusStopIds.includes(
          stopId,
        )
          ? current.selectedBusStopIds.filter((id) => id !== stopId)
          : [...current.selectedBusStopIds, stopId].slice(
              0,
              MAX_SELECTED_BUS_STOPS,
            );
        return { ...current, selectedBusStopIds };
      });
    },
    [mutate],
  );

  const selectSubwayStation = useCallback(
    (stationId: SubwayStation["id"]) => {
      mutate((current) =>
        current.subwayStations.some((station) => station.id === stationId)
          ? { ...current, selectedSubwayStationId: stationId }
          : current,
      );
    },
    [mutate],
  );

  const removeBusStop = useCallback(
    (stopId: BusStop["id"]) => {
      mutate((current) => {
        const busStops = current.busStops.filter(
          (stop) => stop.id !== stopId,
        );
        return {
          ...current,
          busStops,
          selectedBusStopIds: current.selectedBusStopIds.filter(
            (id) => id !== stopId,
          ),
        };
      });
    },
    [mutate],
  );

  const removeSubwayStation = useCallback(
    (stationId: SubwayStation["id"]) => {
      mutate((current) => {
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
    [mutate],
  );

  return {
    selections,
    syncStatus,
    addBusStops,
    addSubwayStations,
    toggleBusStop,
    selectSubwayStation,
    removeBusStop,
    removeSubwayStation,
  } as const;
}
