import { z } from "zod";
import {
  busStopSchema,
  type BusStop,
  type CommuteDirection,
} from "../domain/bus";
import {
  CommuteRouteOptionIdSchema,
  commuteRouteOptionSchema,
  type CommuteRouteOption,
} from "../domain/commute";
import { subwayStationSchema } from "../domain/subway";

const STORAGE_KEY = "commute-bus-web:stops:v3";
const PREVIOUS_STORAGE_KEY = "commute-bus-web:stops:v2";
const LEGACY_STORAGE_KEY = "commute-bus-web:stops:v1";

const previousCommutePlaceSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1),
  stops: z.array(busStopSchema),
  subwayStations: z.array(subwayStationSchema).default([]),
  selectedStopId: busStopSchema.shape.id.nullable(),
});

const commutePlaceSchema = previousCommutePlaceSchema.extend({
  routeOptions: z.array(commuteRouteOptionSchema),
  activeRouteOptionId: CommuteRouteOptionIdSchema.nullable(),
});

const directionCollectionSchema = z.object({
  places: z.array(commutePlaceSchema),
  activePlaceId: z.string().min(1).nullable(),
});

const previousDirectionCollectionSchema = z.object({
  places: z.array(previousCommutePlaceSchema),
  activePlaceId: z.string().min(1).nullable(),
});

const commuteStopsSchema = z.object({
  company: directionCollectionSchema,
  home: directionCollectionSchema,
});

const previousCommuteStopsSchema = z.object({
  company: previousDirectionCollectionSchema,
  home: previousDirectionCollectionSchema,
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

function createMigratedRouteOption(stop: BusStop): CommuteRouteOption {
  return commuteRouteOptionSchema.parse({
    id: `migrated-${stop.id}`,
    startStopId: stop.id,
    transferStationId: null,
  });
}

function createDefaultPlace(
  direction: CommuteDirection,
  stop: BusStop | null = null,
): CommutePlace {
  const routeOptions = stop ? [createMigratedRouteOption(stop)] : [];
  return {
    id: `${direction}-1`,
    name: `${PLACE_COPY[direction]} 1`,
    stops: stop ? [stop] : [],
    subwayStations: [],
    selectedStopId: stop?.id ?? null,
    routeOptions,
    activeRouteOptionId: routeOptions[0]?.id ?? null,
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
    const stopIds = new Set(place.stops.map((stop) => stop.id));
    const stationIds = new Set(
      place.subwayStations.map((station) => station.id),
    );
    const optionIds = new Set<string>();
    const pairs = new Set<string>();
    const routeOptions = place.routeOptions.filter((option) => {
      const pair = `${option.startStopId}:${option.transferStationId ?? ""}`;
      const valid =
        stopIds.has(option.startStopId) &&
        (option.transferStationId === null ||
          stationIds.has(option.transferStationId)) &&
        !optionIds.has(option.id) &&
        !pairs.has(pair);
      if (valid) {
        optionIds.add(option.id);
        pairs.add(pair);
      }
      return valid;
    });
    const selectedStopId =
      place.selectedStopId !== null && stopIds.has(place.selectedStopId)
        ? place.selectedStopId
        : (place.stops[0]?.id ?? null);
    const activeRouteOptionId = optionIds.has(
      place.activeRouteOptionId ?? "",
    )
      ? place.activeRouteOptionId
      : (routeOptions.find((option) => option.startStopId === selectedStopId)
          ?.id ??
        routeOptions[0]?.id ??
        null);
    const activeRoute = routeOptions.find(
      (option) => option.id === activeRouteOptionId,
    );
    return {
      ...place,
      routeOptions,
      activeRouteOptionId,
      selectedStopId: activeRoute?.startStopId ?? selectedStopId,
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

function migratePreviousCollection(
  collection: z.infer<typeof previousDirectionCollectionSchema>,
): DirectionCollection {
  return normalizeCollection({
    activePlaceId: collection.activePlaceId,
    places: collection.places.map((place) => {
      const routeOptions = place.stops.map(createMigratedRouteOption);
      return {
        ...place,
        routeOptions,
        activeRouteOptionId:
          routeOptions.find(
            (option) => option.startStopId === place.selectedStopId,
          )?.id ??
          routeOptions[0]?.id ??
          null,
      };
    }),
  });
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

function parsePreviousCommutes(stored: string): CommuteStops | null {
  try {
    const parsed = previousCommuteStopsSchema.safeParse(JSON.parse(stored));
    if (!parsed.success) {
      return null;
    }
    return {
      company: migratePreviousCollection(parsed.data.company),
      home: migratePreviousCollection(parsed.data.home),
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

  const previousStored = window.localStorage.getItem(PREVIOUS_STORAGE_KEY);
  if (previousStored) {
    const parsed = parsePreviousCommutes(previousStored);
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
