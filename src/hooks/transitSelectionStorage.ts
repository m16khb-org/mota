import { z } from "zod";
import { busStopSchema } from "../domain/bus";
import { subwayStationSchema } from "../domain/subway";

const STORAGE_KEY = "mota:transit-selections:v1";
const LEGACY_STORAGE_KEY = "commute-bus-web:stops:v4";

const transitSelectionsSchema = z.object({
  busStops: z.array(busStopSchema),
  subwayStations: z.array(subwayStationSchema),
  selectedBusStopId: busStopSchema.shape.id.nullable(),
  selectedSubwayStationId: subwayStationSchema.shape.id.nullable(),
});

const legacyPlaceSchema = z.object({
  stops: z.array(busStopSchema).default([]),
  subwayStations: z.array(subwayStationSchema).default([]),
  selectedStopId: busStopSchema.shape.id.nullable().default(null),
});

const legacyCollectionSchema = z.object({
  places: z.array(legacyPlaceSchema).default([]),
});

const legacyCommutesSchema = z.object({
  company: legacyCollectionSchema,
  home: legacyCollectionSchema,
});

export type TransitSelections = Readonly<
  z.infer<typeof transitSelectionsSchema>
>;
export type TransitSelectionStorage = Pick<Storage, "getItem" | "setItem">;

const EMPTY_SELECTIONS: TransitSelections = {
  busStops: [],
  subwayStations: [],
  selectedBusStopId: null,
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
  return {
    busStops,
    subwayStations,
    selectedBusStopId: busStops.some(
      (stop) => stop.id === selections.selectedBusStopId,
    )
      ? selections.selectedBusStopId
      : (busStops[0]?.id ?? null),
    selectedSubwayStationId: subwayStations.some(
      (station) => station.id === selections.selectedSubwayStationId,
    )
      ? selections.selectedSubwayStationId
      : (subwayStations[0]?.id ?? null),
  };
}

function migrateLegacy(value: unknown): TransitSelections | null {
  const parsed = legacyCommutesSchema.safeParse(value);
  if (!parsed.success) {
    return null;
  }
  const places = [
    ...parsed.data.company.places,
    ...parsed.data.home.places,
  ];
  const selectedBusStopId =
    places.find((place) => place.selectedStopId !== null)?.selectedStopId ??
    null;
  return normalize({
    busStops: places.flatMap((place) => place.stops),
    subwayStations: places.flatMap((place) => place.subwayStations),
    selectedBusStopId,
    selectedSubwayStationId: null,
  });
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

  const legacy = store.getItem(LEGACY_STORAGE_KEY);
  if (legacy === null) {
    return EMPTY_SELECTIONS;
  }
  return migrateLegacy(parseJson(legacy)) ?? EMPTY_SELECTIONS;
}

export function saveTransitSelections(
  selections: TransitSelections,
  storage?: TransitSelectionStorage,
): void {
  const store = storage ?? window.localStorage;
  store.setItem(STORAGE_KEY, JSON.stringify(selections));
}
