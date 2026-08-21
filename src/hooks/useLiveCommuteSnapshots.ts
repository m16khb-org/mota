import { useCallback, useEffect, useRef, useState } from "react";
import { liveArrivalsPort } from "../api/client";
import {
  refreshLiveQueries,
  type LiveQuery,
  type LiveSnapshot,
} from "../domain/liveCommuteQueries";

/** Foreground-only refresh cadence; ticks are skipped while a refresh runs. */
export const LIVE_REFRESH_INTERVAL_MS = 30_000;

export interface UseLiveCommuteSnapshotsResult {
  /** Per-query snapshots keyed by `LiveQuery.key`; obsolete keys are dropped. */
  readonly snapshots: ReadonlyMap<string, LiveSnapshot>;
  /** Starts a refresh now; ignored while one is already in flight. */
  readonly refresh: () => void;
}

interface RefreshGeneration {
  readonly id: number;
  /** Snapshots before this attempt marked them pending; restored on abort. */
  readonly preAttempt: ReadonlyMap<string, LiveSnapshot>;
}

/**
 * Foreground refresh controller for the active live query set. Loads
 * immediately, refreshes on a non-overlapping 30-second schedule while the
 * document is visible, and refreshes on `online`, hidden-to-visible
 * `visibilitychange`, and manual `refresh()`. Obsolete generations (hidden,
 * changed query inputs, unmount) are aborted: their resolutions can never
 * overwrite current snapshots, and pending marks revert to the pre-attempt
 * state. Attempt fields follow Task 5's `LiveSnapshot` contract exactly;
 * freshness stays owned by `snapshotBasis`.
 */
export function useLiveCommuteSnapshots(
  queries: readonly LiveQuery[],
): UseLiveCommuteSnapshotsResult {
  const [snapshots, setSnapshots] = useState<
    ReadonlyMap<string, LiveSnapshot>
  >(() => new Map());
  const snapshotsRef = useRef(snapshots);
  const queriesRef = useRef(queries);
  queriesRef.current = queries;
  const generationRef = useRef<RefreshGeneration | null>(null);
  const nextGenerationIdRef = useRef(1);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const appliedSignatureRef = useRef<string | null>(null);

  const commit = useCallback((next: ReadonlyMap<string, LiveSnapshot>) => {
    snapshotsRef.current = next;
    setSnapshots(next);
  }, []);

  const abortActiveGeneration = useCallback(() => {
    const generation = generationRef.current;
    if (generation === null) return;
    generationRef.current = null;
    commit(generation.preAttempt);
  }, [commit]);

  const startRefresh = useCallback(() => {
    if (generationRef.current !== null) return;
    const activeQueries = queriesRef.current;
    if (activeQueries.length === 0) return;
    const now = Date.now();
    const preAttempt = snapshotsRef.current;
    const next = new Map<string, LiveSnapshot>();
    for (const query of activeQueries) {
      next.set(query.key, {
        query,
        latestAttemptAt: now,
        latestAttemptStatus: "pending",
        lastSuccess: preAttempt.get(query.key)?.lastSuccess ?? null,
        error: null,
      });
    }
    commit(next);

    const id = nextGenerationIdRef.current;
    nextGenerationIdRef.current += 1;
    generationRef.current = { id, preAttempt };

    refreshLiveQueries(activeQueries, {
        port: liveArrivalsPort,
        previous: preAttempt,
      })
      .then((result) => {
        if (generationRef.current?.id !== id) return;
        generationRef.current = null;
        const merged = new Map(snapshotsRef.current);
        for (const [key, snapshot] of result) {
          merged.set(key, snapshot);
        }
        commit(merged);
      })
      .catch((error: unknown) => {
        if (generationRef.current?.id !== id) return;
        generationRef.current = null;
        const message = error instanceof Error ? error.message : String(error);
        const failed = new Map(snapshotsRef.current);
        for (const query of activeQueries) {
          failed.set(query.key, {
            query,
            latestAttemptAt: now,
            latestAttemptStatus: "failure",
            lastSuccess: preAttempt.get(query.key)?.lastSuccess ?? null,
            error: message,
          });
        }
        commit(failed);
      });
  }, [commit]);

  const armSchedule = useCallback(() => {
    if (intervalRef.current !== null) return;
    intervalRef.current = setInterval(() => {
      startRefresh();
    }, LIVE_REFRESH_INTERVAL_MS);
  }, [startRefresh]);

  const clearSchedule = useCallback(() => {
    if (intervalRef.current === null) return;
    clearInterval(intervalRef.current);
    intervalRef.current = null;
  }, []);

  useEffect(() => {
    const signature = JSON.stringify(queries);
    if (appliedSignatureRef.current === signature) return;
    appliedSignatureRef.current = signature;
    abortActiveGeneration();
    const next = new Map<string, LiveSnapshot>();
    for (const query of queries) {
      next.set(
        query.key,
        snapshotsRef.current.get(query.key) ?? {
          query,
          latestAttemptAt: 0,
          latestAttemptStatus: "idle",
          lastSuccess: null,
          error: null,
        },
      );
    }
    commit(next);
    if (document.visibilityState === "visible") {
      startRefresh();
      armSchedule();
    }
  }, [queries, abortActiveGeneration, commit, startRefresh, armSchedule]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        startRefresh();
        armSchedule();
      } else {
        abortActiveGeneration();
        clearSchedule();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [startRefresh, armSchedule, abortActiveGeneration, clearSchedule]);

  useEffect(() => {
    const handleOnline = () => {
      if (document.visibilityState === "visible") {
        startRefresh();
      }
    };
    window.addEventListener("online", handleOnline);
    return () => {
      window.removeEventListener("online", handleOnline);
    };
  }, [startRefresh]);

  useEffect(
    () => () => {
      generationRef.current = null;
      clearSchedule();
      appliedSignatureRef.current = null;
    },
    [clearSchedule],
  );

  return { snapshots, refresh: startRefresh };
}
