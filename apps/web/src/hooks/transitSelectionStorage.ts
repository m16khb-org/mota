import {
  MAX_SELECTED_BUS_STOPS,
  transitSelectionsSchema,
  type TransitSelections,
} from "@mota/contracts/transit-settings";

const STORAGE_KEY = "mota:transit-selections:v1";

export type TransitSelectionStorage = Pick<Storage, "getItem" | "setItem">;

const EMPTY_SELECTIONS: TransitSelections = {
  busStops: [],
  subwayStations: [],
  selectedBusStopIds: [],
  selectedSubwayStationId: null,
};

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch (error) {
    if (error instanceof SyntaxError) {
      return null;
    }
    throw error;
  }
}

function uniqueById<T extends { readonly id: string }>(
  values: readonly T[],
): T[] {
  return [...new Map(values.map((value) => [value.id, value])).values()];
}

function normalize(selections: TransitSelections): TransitSelections {
  const busStops = uniqueById(selections.busStops);
  const subwayStations = uniqueById(selections.subwayStations);
  const knownIds = new Set(busStops.map((stop) => stop.id));
  const selectedBusStopIds = [
    ...new Set(selections.selectedBusStopIds),
  ].filter((stopId) => knownIds.has(stopId));
  return {
    busStops,
    subwayStations,
    selectedBusStopIds:
      selectedBusStopIds.length > 0
        ? selectedBusStopIds.slice(0, MAX_SELECTED_BUS_STOPS)
        : (busStops[0]
          ? [busStops[0].id]
          : []),
    selectedSubwayStationId: subwayStations.some(
      (station) => station.id === selections.selectedSubwayStationId,
    )
      ? selections.selectedSubwayStationId
      : (subwayStations[0]?.id ?? null),
  };
}

export function loadTransitSelections(
  storage?: TransitSelectionStorage,
): TransitSelections {
  const store =
    storage ?? (typeof window === "undefined" ? null : window.localStorage);
  if (store === null) {
    return EMPTY_SELECTIONS;
  }

  const stored = store.getItem(STORAGE_KEY);
  if (stored !== null) {
    const parsed = transitSelectionsSchema.safeParse(parseJson(stored));
    if (parsed.success) {
      return normalize(parsed.data);
    }
  }

  return EMPTY_SELECTIONS;
}

export function saveTransitSelections(
  selections: TransitSelections,
  storage?: TransitSelectionStorage,
): void {
  const store = storage ?? window.localStorage;
  store.setItem(STORAGE_KEY, JSON.stringify(selections));
}
