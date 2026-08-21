import { z } from "zod";
import {
  busStopSchema,
  type BusStop,
  type CommuteDirection,
} from "../domain/bus";
import {
  CommuteProcedureIdSchema,
  CommuteRouteOptionIdSchema,
  commuteFavoriteSchema,
  commuteRouteOptionSchema,
  savedCommuteProcedureSchema,
  type CommuteFavorite,
  type CommuteRouteOption,
  type LegacyCommuteDraft,
  type SavedCommuteProcedure,
} from "../domain/commute";
import { subwayStationSchema } from "../domain/subway";
import { favoriteIdentityKey } from "./commuteStopsSelectors";

const STORAGE_KEY = "commute-bus-web:stops:v4";
const V3_STORAGE_KEY = "commute-bus-web:stops:v3";
const V2_STORAGE_KEY = "commute-bus-web:stops:v2";
const V1_STORAGE_KEY = "commute-bus-web:stops:v1";

/** Storage seam for tests and one-shot drivers; the app uses window.localStorage. */
export type CommuteStorage = Pick<Storage, "getItem" | "setItem">;

const previousCommutePlaceSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1),
  stops: z.array(busStopSchema),
  subwayStations: z.array(subwayStationSchema).default([]),
  selectedStopId: busStopSchema.shape.id.nullable(),
});

/** v3 added explicit bus-only/transfer route options; still stored inside v4
 * places until the route-option UI is retired (plan task 10). */
const v3CommutePlaceSchema = previousCommutePlaceSchema.extend({
  routeOptions: z.array(commuteRouteOptionSchema),
  activeRouteOptionId: CommuteRouteOptionIdSchema.nullable(),
});

/** v4 adds ordered commute procedures (ready or migrated legacy drafts) and
 * exact-service favorites; only v4 is ever written. */
const commutePlaceSchema = v3CommutePlaceSchema.extend({
  procedures: z.array(savedCommuteProcedureSchema),
  favorites: z.array(commuteFavoriteSchema),
  activeProcedureId: CommuteProcedureIdSchema.nullable(),
});

const directionCollectionSchema = z.object({
  places: z.array(commutePlaceSchema),
  activePlaceId: z.string().min(1).nullable(),
});

const v3DirectionCollectionSchema = z.object({
  places: z.array(v3CommutePlaceSchema),
  activePlaceId: z.string().min(1).nullable(),
});

const commuteStopsSchema = z.object({
  company: directionCollectionSchema,
  home: directionCollectionSchema,
});

const v3CommuteStopsSchema = z.object({
  company: v3DirectionCollectionSchema,
  home: v3DirectionCollectionSchema,
});

const previousDirectionCollectionSchema = z.object({
  places: z.array(previousCommutePlaceSchema),
  activePlaceId: z.string().min(1).nullable(),
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

type V3DirectionCollection = z.infer<typeof v3DirectionCollectionSchema>;

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

/** A v3 route option becomes a non-evaluable setup draft that keeps only the
 * stop/station it referenced; no service, direction, or duration is invented. */
function routeOptionToLegacyDraft(option: CommuteRouteOption): LegacyCommuteDraft {
  return {
    id: CommuteProcedureIdSchema.parse(option.id),
    kind: "legacy-draft",
    stopId: option.startStopId,
    stationId: option.transferStationId,
  };
}

function createDefaultPlace(
  direction: CommuteDirection,
  stop: BusStop | null = null,
): CommutePlace {
  const routeOptions = stop ? [createMigratedRouteOption(stop)] : [];
  const procedures = routeOptions.map(routeOptionToLegacyDraft);
  return {
    id: `${direction}-1`,
    name: `${PLACE_COPY[direction]} 1`,
    stops: stop ? [stop] : [],
    subwayStations: [],
    selectedStopId: stop?.id ?? null,
    routeOptions,
    activeRouteOptionId: routeOptions[0]?.id ?? null,
    procedures,
    favorites: [],
    activeProcedureId: procedures[0]?.id ?? null,
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

function normalizeProcedures(
  procedures: readonly SavedCommuteProcedure[],
  stopIds: ReadonlySet<string>,
  stationIds: ReadonlySet<string>,
): SavedCommuteProcedure[] {
  const seenIds = new Set<string>();
  const normalized: SavedCommuteProcedure[] = [];
  for (const procedure of procedures) {
    if (seenIds.has(procedure.id)) {
      continue;
    }
    let candidate = procedure;
    if (procedure.kind === "ready") {
      const referencesSavedPoints = procedure.steps.every((step) =>
        step.kind === "walk"
          ? true
          : step.kind === "bus"
            ? stopIds.has(step.stopId)
            : stationIds.has(step.stationId),
      );
      if (!referencesSavedPoints) {
        continue;
      }
    } else {
      const stopId =
        procedure.stopId !== null && stopIds.has(procedure.stopId)
          ? procedure.stopId
          : null;
      const stationId =
        procedure.stationId !== null && stationIds.has(procedure.stationId)
          ? procedure.stationId
          : null;
      if (stopId === null && stationId === null) {
        continue;
      }
      if (stopId !== procedure.stopId || stationId !== procedure.stationId) {
        candidate = { ...procedure, stopId, stationId };
      }
    }
    seenIds.add(candidate.id);
    normalized.push(candidate);
  }
  return normalized;
}

function normalizeFavorites(
  favorites: readonly CommuteFavorite[],
  stopIds: ReadonlySet<string>,
  stationIds: ReadonlySet<string>,
): CommuteFavorite[] {
  const seenIds = new Set<string>();
  const seenIdentities = new Set<string>();
  const normalized: CommuteFavorite[] = [];
  for (const favorite of favorites) {
    if (seenIds.has(favorite.id)) {
      continue;
    }
    const referencesSavedPoint =
      favorite.kind === "bus"
        ? stopIds.has(favorite.stopId)
        : stationIds.has(favorite.stationId);
    if (!referencesSavedPoint) {
      continue;
    }
    const identity = favoriteIdentityKey(favorite);
    if (seenIdentities.has(identity)) {
      continue;
    }
    seenIds.add(favorite.id);
    seenIdentities.add(identity);
    normalized.push(favorite);
  }
  return normalized;
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
    const procedures = normalizeProcedures(
      place.procedures,
      stopIds,
      stationIds,
    );
    const favorites = normalizeFavorites(place.favorites, stopIds, stationIds);
    const activeProcedureId = procedures.some(
      (procedure) => procedure.id === place.activeProcedureId,
    )
      ? place.activeProcedureId
      : (procedures[0]?.id ?? null);
    return {
      ...place,
      routeOptions,
      activeRouteOptionId,
      selectedStopId: activeRoute?.startStopId ?? selectedStopId,
      procedures,
      favorites,
      activeProcedureId,
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

function normalizeV3Collection(
  collection: z.infer<typeof v3DirectionCollectionSchema>,
): V3DirectionCollection {
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
    const activeRouteOptionId = optionIds.has(place.activeRouteOptionId ?? "")
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

/** v3 -> v4: each route option becomes a legacy draft and selections carry over. */
function migrateV3Collection(collection: V3DirectionCollection): DirectionCollection {
  return normalizeCollection({
    activePlaceId: collection.activePlaceId,
    places: collection.places.map((place) => ({
      ...place,
      procedures: place.routeOptions.map(routeOptionToLegacyDraft),
      favorites: [],
      activeProcedureId:
        place.activeRouteOptionId === null
          ? null
          : CommuteProcedureIdSchema.parse(place.activeRouteOptionId),
    })),
  });
}

function migratePreviousCollection(
  collection: z.infer<typeof previousDirectionCollectionSchema>,
): V3DirectionCollection {
  return normalizeV3Collection({
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

function parseJson(stored: string): unknown {
  try {
    return JSON.parse(stored);
  } catch (error) {
    if (error instanceof SyntaxError) {
      return null;
    }
    throw error;
  }
}

function parseV4Commutes(stored: string): CommuteStops | null {
  const parsed = commuteStopsSchema.safeParse(parseJson(stored));
  if (!parsed.success) {
    return null;
  }
  return {
    company: normalizeCollection(parsed.data.company),
    home: normalizeCollection(parsed.data.home),
  };
}

function parseV3Commutes(stored: string): CommuteStops | null {
  const parsed = v3CommuteStopsSchema.safeParse(parseJson(stored));
  if (!parsed.success) {
    return null;
  }
  return {
    company: migrateV3Collection(normalizeV3Collection(parsed.data.company)),
    home: migrateV3Collection(normalizeV3Collection(parsed.data.home)),
  };
}

function parseV2Commutes(stored: string): CommuteStops | null {
  const parsed = previousCommuteStopsSchema.safeParse(parseJson(stored));
  if (!parsed.success) {
    return null;
  }
  return {
    company: migrateV3Collection(
      migratePreviousCollection(parsed.data.company),
    ),
    home: migrateV3Collection(migratePreviousCollection(parsed.data.home)),
  };
}

export function loadCommutes(storage?: CommuteStorage): CommuteStops {
  const store =
    storage ??
    (typeof window === "undefined" ? null : window.localStorage);
  if (!store) {
    return createInitialCommutes();
  }

  const stored = store.getItem(STORAGE_KEY);
  if (stored) {
    const parsed = parseV4Commutes(stored);
    if (parsed) {
      return parsed;
    }
  }

  const v3Stored = store.getItem(V3_STORAGE_KEY);
  if (v3Stored) {
    const parsed = parseV3Commutes(v3Stored);
    if (parsed) {
      return parsed;
    }
  }

  const v2Stored = store.getItem(V2_STORAGE_KEY);
  if (v2Stored) {
    const parsed = parseV2Commutes(v2Stored);
    if (parsed) {
      return parsed;
    }
  }

  const legacyStored = store.getItem(V1_STORAGE_KEY);
  if (!legacyStored) {
    return createInitialCommutes();
  }

  const legacy = legacyStopsSchema.safeParse(parseJson(legacyStored));
  return legacy.success ? createInitialCommutes(legacy.data) : createInitialCommutes();
}

export function saveCommutes(commutes: CommuteStops, storage?: CommuteStorage): void {
  const store = storage ?? window.localStorage;
  store.setItem(STORAGE_KEY, JSON.stringify(commutes));
}
