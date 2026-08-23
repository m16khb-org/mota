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

interface ArrivalDetailInput {
  readonly selectedStop: BusStop | null;
  readonly selectedStation: SubwayStation | null;
}

export function useArrivalDetail({
  selectedStop,
  selectedStation,
}: ArrivalDetailInput) {
  const [busDetail, setBusDetail] = useState<BusDetailState>(EMPTY_BUS);
  const [subwayDetail, setSubwayDetail] =
    useState<SubwayDetailState>(EMPTY_SUBWAY);
  const busRequest = useRef(0);
  const subwayRequest = useRef(0);

  const fetchBusDetail = useCallback(async (stop: BusStop) => {
    const request = busRequest.current + 1;
    busRequest.current = request;
    setBusDetail((current) => ({ ...current, loading: true, error: null }));
    try {
      const result = await fetchArrivals(stop.arsId);
      if (busRequest.current === request) {
        setBusDetail({
          arrivals: result.arrivals,
          loading: false,
          error: null,
          updatedAt: result.updatedAt,
        });
      }
    } catch {
      if (busRequest.current === request) {
        setBusDetail((current) => ({
          ...current,
          loading: false,
          error: BUS_ERROR,
        }));
      }
    }
  }, []);

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
    if (selectedStop === null) {
      busRequest.current += 1;
      setBusDetail(EMPTY_BUS);
      return;
    }
    void fetchBusDetail(selectedStop);
  }, [fetchBusDetail, selectedStop]);

  useEffect(() => {
    if (selectedStation === null) {
      subwayRequest.current += 1;
      setSubwayDetail(EMPTY_SUBWAY);
      return;
    }
    void fetchSubwayDetail(selectedStation);
  }, [fetchSubwayDetail, selectedStation]);

  return {
    busDetail,
    subwayDetail,
    refreshBusDetail: () => {
      if (selectedStop !== null) {
        void fetchBusDetail(selectedStop);
      }
    },
    refreshSubwayDetail: () => {
      if (selectedStation !== null) {
        void fetchSubwayDetail(selectedStation);
      }
    },
  } as const;
}
