import { useCallback, useEffect, useState } from "react";
import { z } from "zod";
import {
  busStopSchema,
  type BusStop,
  type CommuteDirection,
} from "../domain/bus";

const STORAGE_KEY = "commute-bus-web:stops:v1";

const commuteStopsSchema = z.object({
  company: busStopSchema.nullable(),
  home: busStopSchema.nullable(),
});

export type CommuteStops = Record<CommuteDirection, BusStop | null>;

const EMPTY_STOPS: CommuteStops = { company: null, home: null };

function loadStops(): CommuteStops {
  if (typeof window === "undefined") {
    return EMPTY_STOPS;
  }

  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (!stored) {
    return EMPTY_STOPS;
  }

  try {
    return commuteStopsSchema.parse(JSON.parse(stored));
  } catch {
    return EMPTY_STOPS;
  }
}
export function useCommuteStops() {
  const [stops, setStops] = useState<CommuteStops>(loadStops);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stops));
  }, [stops]);

  const setStop = useCallback((direction: CommuteDirection, stop: BusStop) => {
    setStops((current) => ({ ...current, [direction]: stop }));
  }, []);

  return { stops, setStop } as const;
}
