import { useCallback, useEffect, useState } from "react";
import { fetchArrivals, fetchSubwayArrivals } from "../api/client";
import type { BusArrival, BusStop } from "../domain/bus";
import type { SubwayArrival, SubwayStation } from "../domain/subway";
import type { LiveQuery, LiveSnapshot } from "../domain/liveCommuteQueries";
import {
  busDetailQuery,
  isBusArrivalRow,
  isSubwayArrivalRow,
  subwayDetailQuery,
} from "./useCommuteDailyLive";

export interface BusDetailState {
  readonly arrivals: readonly BusArrival[];
  readonly loading: boolean;
  readonly error: string | null;
  readonly updatedAt: string | null;
}
export interface SubwayDetailState {
  readonly arrivals: readonly SubwayArrival[];
  readonly loading: boolean;
  readonly error: string | null;
  readonly updatedAt: string | null;
}

const EMPTY_BUS: BusDetailState = {
  arrivals: [],
  loading: false,
  error: null,
  updatedAt: null,
};
const EMPTY_SUBWAY: SubwayDetailState = {
  arrivals: [],
  loading: false,
  error: null,
  updatedAt: null,
};
const LOADING_BUS: BusDetailState = {
  arrivals: [],
  loading: true,
  error: null,
  updatedAt: null,
};
const LOADING_SUBWAY: SubwayDetailState = {
  arrivals: [],
  loading: true,
  error: null,
  updatedAt: null,
};
const BUS_ERROR =
  "도착 정보를 불러오지 못했습니다. 연결을 확인하고 다시 시도해 주세요.";
const SUBWAY_ERROR =
  "지하철 도착 정보를 불러오지 못했습니다. 연결을 확인하고 다시 시도해 주세요.";

/** Detail state derived from the shared live snapshot (no second request):
 * retained success rows, pending loading, honest failure text only when no
 * success was ever retained. */
function busDetailFromSnapshot(snapshot: LiveSnapshot): BusDetailState {
  const rows = snapshot.lastSuccess?.arrivals ?? null;
  return {
    arrivals: rows === null ? [] : rows.filter(isBusArrivalRow),
    loading: snapshot.latestAttemptStatus === "pending",
    error:
      snapshot.latestAttemptStatus === "failure" && rows === null
        ? BUS_ERROR
        : null,
    updatedAt:
      snapshot.lastSuccess === null
        ? null
        : new Date(snapshot.lastSuccess.updatedAt).toISOString(),
  };
}

function subwayDetailFromSnapshot(snapshot: LiveSnapshot): SubwayDetailState {
  const rows = snapshot.lastSuccess?.arrivals ?? null;
  return {
    arrivals: rows === null ? [] : rows.filter(isSubwayArrivalRow),
    loading: snapshot.latestAttemptStatus === "pending",
    error:
      snapshot.latestAttemptStatus === "failure" && rows === null
        ? SUBWAY_ERROR
        : null,
    updatedAt:
      snapshot.lastSuccess === null
        ? null
        : new Date(snapshot.lastSuccess.updatedAt).toISOString(),
  };
}

interface ArrivalDetailInput {
  readonly selectedStop: BusStop | null;
  readonly selectedStation: SubwayStation | null;
  readonly live: {
    readonly queries: readonly LiveQuery[];
    readonly snapshots: ReadonlyMap<string, LiveSnapshot>;
    readonly refresh: () => void;
  };
}

export interface UseArrivalDetailResult {
  readonly busDetail: BusDetailState;
  readonly subwayDetail: SubwayDetailState;
  readonly refreshBusDetail: () => void;
  readonly refreshSubwayDetail: () => void;
}

/** Arrival-detail panels for the selected stop/station. When the point is
 * already covered by the shared live query set, the detail reuses that
 * snapshot and never issues an overlapping endpoint request; points outside
 * the live set keep their own full-detail fetch (needed before pinning). */
export function useArrivalDetail({
  selectedStop,
  selectedStation,
  live,
}: ArrivalDetailInput): UseArrivalDetailResult {
  const sharedBusQuery = busDetailQuery(live.queries, selectedStop);
  const sharedBusSnapshot =
    sharedBusQuery === null
      ? null
      : (live.snapshots.get(sharedBusQuery.key) ?? null);
  const sharedSubwayQuery = subwayDetailQuery(live.queries, selectedStation);
  const sharedSubwaySnapshot =
    sharedSubwayQuery === null
      ? null
      : (live.snapshots.get(sharedSubwayQuery.key) ?? null);

  const [ownBus, setOwnBus] = useState<BusDetailState>(EMPTY_BUS);
  const [ownSubway, setOwnSubway] = useState<SubwayDetailState>(EMPTY_SUBWAY);

  const fetchBusDetail = useCallback(async (stop: BusStop) => {
    setOwnBus((current) => ({ ...current, loading: true, error: null }));
    try {
      const result = await fetchArrivals(stop.arsId);
      setOwnBus({
        arrivals: result.arrivals,
        loading: false,
        error: null,
        updatedAt: result.updatedAt,
      });
    } catch {
      setOwnBus((current) => ({ ...current, loading: false, error: BUS_ERROR }));
    }
  }, []);

  useEffect(() => {
    if (selectedStop && sharedBusQuery === null) {
      void fetchBusDetail(selectedStop);
    } else if (!selectedStop) {
      setOwnBus(EMPTY_BUS);
    }
  }, [fetchBusDetail, selectedStop, sharedBusQuery]);

  const fetchSubwayDetail = useCallback(async (station: SubwayStation) => {
    setOwnSubway((current) => ({ ...current, loading: true, error: null }));
    try {
      const result = await fetchSubwayArrivals(station.name);
      setOwnSubway({
        arrivals: result.arrivals,
        loading: false,
        error: null,
        updatedAt: result.updatedAt,
      });
    } catch {
      setOwnSubway((current) => ({
        ...current,
        loading: false,
        error: SUBWAY_ERROR,
      }));
    }
  }, []);

  useEffect(() => {
    if (selectedStation && sharedSubwayQuery === null) {
      void fetchSubwayDetail(selectedStation);
    } else if (!selectedStation) {
      setOwnSubway(EMPTY_SUBWAY);
    }
  }, [fetchSubwayDetail, selectedStation, sharedSubwayQuery]);

  const busDetail =
    sharedBusQuery === null
      ? ownBus
      : sharedBusSnapshot === null
        ? LOADING_BUS
        : busDetailFromSnapshot(sharedBusSnapshot);
  const subwayDetail =
    sharedSubwayQuery === null
      ? ownSubway
      : sharedSubwaySnapshot === null
        ? LOADING_SUBWAY
        : subwayDetailFromSnapshot(sharedSubwaySnapshot);

  return {
    busDetail,
    subwayDetail,
    refreshBusDetail: () => {
      if (sharedBusQuery === null && selectedStop !== null) {
        void fetchBusDetail(selectedStop);
        return;
      }
      live.refresh();
    },
    refreshSubwayDetail: () => {
      if (sharedSubwayQuery === null && selectedStation !== null) {
        void fetchSubwayDetail(selectedStation);
        return;
      }
      live.refresh();
    },
  } as const;
}
