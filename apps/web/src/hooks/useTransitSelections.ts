import { useCallback, useEffect, useRef, useState } from "react";
import type {
  CommuteContext,
  TransitSelections,
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
import {
  addBusStopsToCommute,
  addSubwayStationsToCommute,
  removeBusStopFromCommute,
  removeSubwayStationFromCommute,
  selectSubwayStationForCommute,
  toggleBusStopForCommute,
} from "./transitSelectionMutations";
import type { AuthSessionState } from "./useAuthSession";

export type TransitSyncStatus =
  | "local"
  | "loading"
  | "saving"
  | "synced"
  | "error";

export function useTransitSelections(session: AuthSessionState) {
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
    (commute: CommuteContext, stops: readonly BusStop[]) =>
      mutate((current) =>
        addBusStopsToCommute(current, commute, stops),
      ),
    [mutate],
  );

  const addSubwayStations = useCallback(
    (
      commute: CommuteContext,
      stations: readonly SubwayStation[],
    ) =>
      mutate((current) =>
        addSubwayStationsToCommute(current, commute, stations),
      ),
    [mutate],
  );

  const toggleBusStop = useCallback(
    (commute: CommuteContext, stopId: BusStop["id"]) =>
      mutate((current) =>
        toggleBusStopForCommute(current, commute, stopId),
      ),
    [mutate],
  );

  const selectSubwayStation = useCallback(
    (
      commute: CommuteContext,
      stationId: SubwayStation["id"],
    ) =>
      mutate((current) =>
        selectSubwayStationForCommute(
          current,
          commute,
          stationId,
        ),
      ),
    [mutate],
  );

  const removeBusStop = useCallback(
    (commute: CommuteContext, stopId: BusStop["id"]) =>
      mutate((current) =>
        removeBusStopFromCommute(current, commute, stopId),
      ),
    [mutate],
  );

  const removeSubwayStation = useCallback(
    (
      commute: CommuteContext,
      stationId: SubwayStation["id"],
    ) =>
      mutate((current) =>
        removeSubwayStationFromCommute(
          current,
          commute,
          stationId,
        ),
      ),
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
