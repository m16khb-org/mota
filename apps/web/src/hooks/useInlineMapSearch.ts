import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchNearbyStops,
  fetchNearbySubwayStations,
  isServiceAreaError,
} from "../api/client";
import type { BusStop } from "../domain/bus";
import type { SubwayStation } from "../domain/subway";
import type { TransitMode } from "../components/TransitPointSelector";

interface Point {
  readonly lat: number;
  readonly lng: number;
}

interface InlineMapSearchOptions {
  readonly mode: TransitMode | null;
  readonly center: Point;
  readonly savedStops: readonly BusStop[];
  readonly savedStations: readonly SubwayStation[];
}

function searchError(mode: TransitMode, error: unknown): string {
  if (isServiceAreaError(error)) {
    return "서울 서비스 범위 밖이에요. 지도를 서울 근처로 옮겨 주세요.";
  }
  return mode === "bus"
    ? "정류장을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요."
    : "지하철역을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.";
}

export function useInlineMapSearch({
  mode,
  center,
  savedStops,
  savedStations,
}: InlineMapSearchOptions) {
  const [busStops, setBusStops] = useState<BusStop[]>([]);
  const [stations, setStations] = useState<SubwayStation[]>([]);
  const [selectedBusStops, setSelectedBusStops] = useState<BusStop[]>([]);
  const [selectedStations, setSelectedStations] = useState<SubwayStation[]>(
    [],
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef(0);
  const modeRef = useRef(mode);
  const centerRef = useRef(center);
  const savedStopsRef = useRef(savedStops);
  const savedStationsRef = useRef(savedStations);
  modeRef.current = mode;
  centerRef.current = center;
  savedStopsRef.current = savedStops;
  savedStationsRef.current = savedStations;

  const search = useCallback(async () => {
    const targetMode = modeRef.current;
    if (targetMode === null) {
      return;
    }
    const request = requestRef.current + 1;
    requestRef.current = request;
    setLoading(true);
    setError(null);
    try {
      if (targetMode === "bus") {
        const savedIds = new Set(
          savedStopsRef.current.map((stop) => stop.id),
        );
        const nextStops = await fetchNearbyStops(centerRef.current);
        if (requestRef.current !== request) {
          return;
        }
        const candidates = nextStops.filter(
          (stop) => !savedIds.has(stop.id),
        );
        setBusStops(candidates);
        setStations([]);
        if (candidates.length === 0) {
          setError("이 주변에서 새 정류장을 찾지 못했습니다.");
        }
        return;
      }

      const savedIds = new Set(
        savedStationsRef.current.map((station) => station.id),
      );
      const nextStations = await fetchNearbySubwayStations(
        centerRef.current,
      );
      if (requestRef.current !== request) {
        return;
      }
      const candidates = nextStations.filter(
        (station) => !savedIds.has(station.id),
      );
      setStations(candidates);
      setBusStops([]);
      if (candidates.length === 0) {
        setError("이 주변에서 새 지하철역을 찾지 못했습니다.");
      }
    } catch (searchFailure) {
      if (requestRef.current === request) {
        setError(searchError(targetMode, searchFailure));
      }
    } finally {
      if (requestRef.current === request) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    requestRef.current += 1;
    setBusStops([]);
    setStations([]);
    setSelectedBusStops([]);
    setSelectedStations([]);
    setLoading(false);
    setError(null);
    if (mode !== null) {
      void search();
    }
  }, [mode, search]);

  const toggleBusStop = useCallback((stop: BusStop) => {
    setSelectedBusStops((current) =>
      current.some((selected) => selected.id === stop.id)
        ? current.filter((selected) => selected.id !== stop.id)
        : [...current, stop],
    );
  }, []);

  const toggleStation = useCallback((station: SubwayStation) => {
    setSelectedStations((current) =>
      current.some((selected) => selected.id === station.id)
        ? current.filter((selected) => selected.id !== station.id)
        : [...current, station],
    );
  }, []);

  return {
    busStops,
    stations,
    selectedBusStops,
    selectedStations,
    loading,
    error,
    search,
    toggleBusStop,
    toggleStation,
  } as const;
}
