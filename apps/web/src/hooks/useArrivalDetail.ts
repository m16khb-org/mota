import { useCallback, useEffect, useRef, useState } from "react";
import { fetchArrivals, fetchSubwayArrivals } from "../api/client";
import type { BusArrival, BusStop } from "../domain/bus";
import type { SubwayArrival, SubwayStation } from "../domain/subway";

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
const BUS_ERROR =
  "도착 정보를 불러오지 못했습니다. 연결을 확인하고 다시 시도해 주세요.";
const SUBWAY_ERROR =
  "지하철 도착 정보를 불러오지 못했습니다. 연결을 확인하고 다시 시도해 주세요.";

const SUBWAY_REFRESH_INTERVAL_MS = 60_000;

interface ArrivalDetailInput {
  readonly selectedStops: readonly BusStop[];
  readonly selectedStation: SubwayStation | null;
}

export function useArrivalDetail({
  selectedStops,
  selectedStation,
}: ArrivalDetailInput) {
  const [busDetails, setBusDetails] = useState<
    ReadonlyMap<BusStop["id"], BusDetailState>
  >(() => new Map());
  const [subwayDetail, setSubwayDetail] =
    useState<SubwayDetailState>(EMPTY_SUBWAY);
  const busDetailsRef = useRef<Map<BusStop["id"], BusDetailState>>(
    new Map(),
  );
  const busRequests = useRef(new Map<BusStop["id"], number>());
  const subwayRequest = useRef(0);

  const readBusDetail = useCallback(
    (stopId: BusStop["id"]): BusDetailState =>
      busDetailsRef.current.get(stopId) ?? EMPTY_BUS,
    [],
  );

  const writeBusDetail = useCallback(
    (stopId: BusStop["id"], next: BusDetailState) => {
      busDetailsRef.current.set(stopId, next);
      setBusDetails(new Map(busDetailsRef.current));
    },
    [],
  );

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

  const fetchSubwayDetail = useCallback(async (station: SubwayStation) => {
    const request = subwayRequest.current + 1;
    subwayRequest.current = request;
    setSubwayDetail((current) => ({
      ...current,
      loading: true,
      error: null,
    }));
    try {
      const result = await fetchSubwayArrivals(station.name);
      if (subwayRequest.current === request) {
        setSubwayDetail({
          arrivals: result.arrivals,
          loading: false,
          error: null,
          updatedAt: result.updatedAt,
        });
      }
    } catch {
      if (subwayRequest.current === request) {
        setSubwayDetail((current) => ({
          ...current,
          loading: false,
          error: SUBWAY_ERROR,
        }));
      }
    }
  }, []);

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

  useEffect(() => {
    if (selectedStation === null) {
      subwayRequest.current += 1;
      setSubwayDetail(EMPTY_SUBWAY);
      return;
    }
    void fetchSubwayDetail(selectedStation);
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void fetchSubwayDetail(selectedStation);
      }
    }, SUBWAY_REFRESH_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [fetchSubwayDetail, selectedStation]);

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
    subwayDetail,
    refreshBusDetail,
    refreshSubwayDetail: () => {
      if (selectedStation !== null) {
        void fetchSubwayDetail(selectedStation);
      }
    },
  } as const;
}
