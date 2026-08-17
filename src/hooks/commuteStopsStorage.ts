import { z } from "zod";
import {
  busStopSchema,
  type BusStop,
  type CommuteDirection,
} from "../domain/bus";

const STORAGE_KEY = "commute-bus-web:stops:v2";
const LEGACY_STORAGE_KEY = "commute-bus-web:stops:v1";

const commutePlaceSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1),
  stops: z.array(busStopSchema),
  selectedStopId: busStopSchema.shape.id.nullable(),
});

const directionCollectionSchema = z.object({
  places: z.array(commutePlaceSchema),
  activePlaceId: z.string().min(1).nullable(),
});

const commuteStopsSchema = z.object({
  company: directionCollectionSchema,
  home: directionCollectionSchema,
});

const legacyStopsSchema = z.object({
  company: busStopSchema.nullable(),
  home: busStopSchema.nullable(),
});

export type CommutePlace = Readonly<z.infer<typeof commutePlaceSchema>>;
export type DirectionCollection = Readonly<
  z.infer<typeof directionCollectionSchema>
>;
export type CommuteStops = Readonly<z.infer<typeof commuteStopsSchema>>;

const PLACE_COPY = {
  company: "회사",
  home: "집",
} as const;

function createDefaultPlace(
  direction: CommuteDirection,
  stop: BusStop | null = null,
): CommutePlace {
  return {
    id: `${direction}-1`,
    name: `${PLACE_COPY[direction]} 1`,
    stops: stop ? [stop] : [],
    selectedStopId: stop?.id ?? null,
  };
}

function createInitialCommutes(
  legacy: { company: BusStop | null; home: BusStop | null } = {
    company: null,
    home: null,
  },
): CommuteStops {
  const companyPlace = createDefaultPlace("company", legacy.company);
  const homePlace = createDefaultPlace("home", legacy.home);
  return {
    company: { places: [companyPlace], activePlaceId: companyPlace.id },
    home: { places: [homePlace], activePlaceId: homePlace.id },
  };
}

function normalizeCollection(
  collection: z.infer<typeof directionCollectionSchema>,
): DirectionCollection {
  const places = collection.places.map((place) => {
    const selectedStopExists = place.stops.some(
      (stop) => stop.id === place.selectedStopId,
    );
    return {
      ...place,
      selectedStopId: selectedStopExists
        ? place.selectedStopId
        : (place.stops[0]?.id ?? null),
    };
  });
  const activePlaceExists = places.some(
    (place) => place.id === collection.activePlaceId,
  );
  return {
    places,
    activePlaceId: activePlaceExists
      ? collection.activePlaceId
      : (places[0]?.id ?? null),
  };
}

function parseStoredCommutes(stored: string): CommuteStops | null {
  try {
    const parsed = commuteStopsSchema.safeParse(JSON.parse(stored));
    if (!parsed.success) {
      return null;
    }
    return {
      company: normalizeCollection(parsed.data.company),
      home: normalizeCollection(parsed.data.home),
    };
  } catch (error) {
    if (error instanceof SyntaxError) {
      return null;
    }
    throw error;
  }
}

export function loadCommutes(): CommuteStops {
  if (typeof window === "undefined") {
    return createInitialCommutes();
  }

  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored) {
    const parsed = parseStoredCommutes(stored);
    if (parsed) {
      return parsed;
    }
  }

  const legacyStored = window.localStorage.getItem(LEGACY_STORAGE_KEY);
  if (!legacyStored) {
    return createInitialCommutes();
  }

  try {
    const legacy = legacyStopsSchema.safeParse(JSON.parse(legacyStored));
    return legacy.success
      ? createInitialCommutes(legacy.data)
      : createInitialCommutes();
  } catch (error) {
    if (error instanceof SyntaxError) {
      return createInitialCommutes();
    }
    throw error;
  }
}

export function saveCommutes(commutes: CommuteStops): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(commutes));
}

export function createPlaceId(direction: CommuteDirection): string {
  const random = new Uint32Array(2);
  window.crypto.getRandomValues(random);
  const [first = 0, second = 0] = random;
  return `${direction}-${first.toString(36)}${second.toString(36)}`;
}

export function getActivePlace(
  collection: DirectionCollection,
): CommutePlace | null {
  return (
    collection.places.find((place) => place.id === collection.activePlaceId) ??
    null
  );
}

export function getActiveStop(place: CommutePlace | null): BusStop | null {
  return (
    place?.stops.find((stop) => stop.id === place.selectedStopId) ?? null
  );
}
