import { useCallback, useEffect, useRef, useState } from "react";
import { fetchNearbyStops, isServiceAreaError } from "../api/client";
import type { BusStop } from "../domain/bus";

interface InlineMapSearchOptions {
  readonly mode: "bus" | null;
  readonly center: { readonly lat: number; readonly lng: number };
  readonly savedStops: readonly BusStop[];
}

export function useInlineMapSearch({ mode, center, savedStops }: InlineMapSearchOptions) {
  const [busStops, setBusStops] = useState<BusStop[]>([]);
  const [selectedBusStops, setSelectedBusStops] = useState<BusStop[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef(0);
  const optionsRef = useRef({ mode, center, savedStops });
  optionsRef.current = { mode, center, savedStops };

  const search = useCallback(async () => {
    const { mode: activeMode, center: activeCenter, savedStops: saved } = optionsRef.current;
    if (activeMode === null) return;
    const request = ++requestRef.current;
    setLoading(true);
    setError(null);
    try {
      const stops = await fetchNearbyStops(activeCenter);
      if (requestRef.current !== request) return;
      const savedIds = new Set(saved.map((stop) => stop.id));
      const candidates = stops.filter((stop) => !savedIds.has(stop.id));
      setBusStops(candidates);
      if (candidates.length === 0) setError("이 주변에서 새 정류장을 찾지 못했습니다.");
    } catch (failure) {
      if (requestRef.current === request) {
        setError(
          isServiceAreaError(failure)
            ? "서울 서비스 범위 밖이에요. 지도를 서울 근처로 옮겨 주세요."
            : "정류장을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.",
        );
      }
    } finally {
      if (requestRef.current === request) setLoading(false);
    }
  }, []);

  useEffect(() => {
    requestRef.current += 1;
    setBusStops([]);
    setSelectedBusStops([]);
    setLoading(false);
    setError(null);
    if (mode !== null) void search();
    return () => {
      requestRef.current += 1;
    };
  }, [mode, search]);

  const toggleBusStop = useCallback((stop: BusStop) => {
    setSelectedBusStops((current) =>
      current.some((selected) => selected.id === stop.id)
        ? current.filter((selected) => selected.id !== stop.id)
        : [...current, stop],
    );
  }, []);

  return { busStops, selectedBusStops, loading, error, search, toggleBusStop } as const;
}
