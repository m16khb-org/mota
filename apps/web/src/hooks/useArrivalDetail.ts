import { useCallback, useEffect, useRef, useState } from "react";
import { fetchArrivals } from "../api/client";
import type { BusArrival, BusStop } from "../domain/bus";

export interface BusDetailState {
  readonly arrivals: readonly BusArrival[];
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
const BUS_ERROR = "도착 정보를 불러오지 못했습니다. 연결을 확인하고 다시 시도해 주세요.";
interface ArrivalDetailInput {
  readonly selectedStops: readonly BusStop[];
}

export function useArrivalDetail({ selectedStops }: ArrivalDetailInput) {
  const [busDetails, setBusDetails] = useState<ReadonlyMap<BusStop["id"], BusDetailState>>(
    () => new Map(),
  );
  const busDetailsRef = useRef<Map<BusStop["id"], BusDetailState>>(new Map());
  const busRequests = useRef(new Map<BusStop["id"], number>());

  const readBusDetail = useCallback(
    (stopId: BusStop["id"]): BusDetailState => busDetailsRef.current.get(stopId) ?? EMPTY_BUS,
    [],
  );

  const writeBusDetail = useCallback((stopId: BusStop["id"], next: BusDetailState) => {
    busDetailsRef.current.set(stopId, next);
    setBusDetails(new Map(busDetailsRef.current));
  }, []);

  const fetchBusDetail = useCallback(
    async (stop: BusStop) => {
      const request = (busRequests.current.get(stop.id) ?? 0) + 1;
      busRequests.current.set(stop.id, request);
      writeBusDetail(stop.id, {
        ...readBusDetail(stop.id),
        loading: true,
        error: null,
      });
      try {
        const result = await fetchArrivals(stop.arsId);
        if (busRequests.current.get(stop.id) === request) {
          writeBusDetail(stop.id, {
            arrivals: result.arrivals,
            loading: false,
            error: null,
            updatedAt: result.updatedAt,
          });
        }
      } catch {
        if (busRequests.current.get(stop.id) === request) {
          writeBusDetail(stop.id, {
            ...readBusDetail(stop.id),
            loading: false,
            error: BUS_ERROR,
          });
        }
      }
    },
    [readBusDetail, writeBusDetail],
  );

  useEffect(() => {
    const ids = new Set(selectedStops.map((stop) => stop.id));
    let removed = false;
    for (const stopId of busDetailsRef.current.keys()) {
      if (!ids.has(stopId)) {
        busDetailsRef.current.delete(stopId);
        busRequests.current.delete(stopId);
        removed = true;
      }
    }
    if (removed) {
      setBusDetails(new Map(busDetailsRef.current));
    }
    for (const stop of selectedStops) {
      if (!busDetailsRef.current.has(stop.id)) {
        void fetchBusDetail(stop);
      }
    }
  }, [fetchBusDetail, selectedStops]);

  const stopsRef = useRef(selectedStops);
  stopsRef.current = selectedStops;

  const refreshBusDetail = useCallback(() => {
    for (const stop of stopsRef.current) {
      void fetchBusDetail(stop);
    }
  }, [fetchBusDetail]);

  return {
    busDetails,
    busDetail: (stopId: BusStop["id"]) => readBusDetail(stopId),
    refreshBusDetail,
  } as const;
}
