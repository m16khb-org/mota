import { z } from "zod";
import {
  busStopSchema,
  type BusStop,
  type CommuteDirection,
} from "../domain/bus";
import {
  CommuteProcedureIdSchema,
  commuteFavoriteSchema,
  commuteProcedureSchema,
  type CommuteFavorite,
  type CommuteProcedure,
} from "../domain/commute";
import { subwayStationSchema } from "../domain/subway";
import { favoriteIdentityKey } from "./commuteIdentity";

const STORAGE_KEY = "commute-bus-web:stops:v4";
const V3_STORAGE_KEY = "commute-bus-web:stops:v3";
const V2_STORAGE_KEY = "commute-bus-web:stops:v2";
const V1_STORAGE_KEY = "commute-bus-web:stops:v1";

/** Storage seam for tests and one-shot drivers; the app uses window.localStorage. */
export type CommuteStorage = Pick<Storage, "getItem" | "setItem">;

/** Read-only shape superseded v4 payloads may still contain: a draft left by
 * the retired v3-route-option migration. It parses so history stays loadable,
 * then normalizeCollection drops it — it is never written back. */
const legacyDraftReadSchema = z.strictObject({
  id: CommuteProcedureIdSchema,
  kind: z.literal("legacy-draft"),
  stopId: busStopSchema.shape.id.nullable(),
  stationId: subwayStationSchema.shape.id.nullable(),
});

const persistedProcedureSchema = z.discriminatedUnion("kind", [
  commuteProcedureSchema,
  legacyDraftReadSchema,
]);

const commutePlaceSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1),
  stops: z.array(busStopSchema),
  subwayStations: z.array(subwayStationSchema).default([]),
  selectedStopId: busStopSchema.shape.id.nullable(),
  procedures: z.array(commuteProcedureSchema),
  favorites: z.array(commuteFavoriteSchema),
  activeProcedureId: CommuteProcedureIdSchema.nullable(),
  /** Departure origin for auto itineraries (walk leg + leave guidance).
   * Older v4 payloads lack the key; null means unset. */
  location: z
    .object({ lat: z.number(), lng: z.number() })
    .nullable()
    .default(null),
});

/** v2/v3 read shape. v3's routeOptions and both versions' extra keys are
 * stripped by Zod on parse; migration discards them instead of keeping
 * drafts. */
const previousCommutePlaceSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1),
  stops: z.array(busStopSchema),
  subwayStations: z.array(subwayStationSchema).default([]),
  selectedStopId: busStopSchema.shape.id.nullable(),
});

const directionCollectionSchema = z.object({
  places: z.array(commutePlaceSchema),
  activePlaceId: z.string().min(1).nullable(),
});

/** Read shape for already-persisted v4 payloads (may still contain drafts). */
const persistedPlaceSchema = commutePlaceSchema.extend({
  procedures: z.array(persistedProcedureSchema),
});

const persistedCollectionSchema = z.object({
  places: z.array(persistedPlaceSchema),
  activePlaceId: z.string().min(1).nullable(),
});

const commuteStopsSchema = z.object({
  company: persistedCollectionSchema,
  home: persistedCollectionSchema,
});

/** Clean in-memory shape: procedures are always ready. */
const commuteStopsShapeSchema = z.object({
  company: directionCollectionSchema,
  home: directionCollectionSchema,
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
export type CommuteStops = Readonly<z.infer<typeof commuteStopsShapeSchema>>;

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
    subwayStations: [],
    selectedStopId: stop?.id ?? null,
    procedures: [],
    favorites: [],
    activeProcedureId: null,
    location: null,
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

/** Ready procedures must reference saved points; auto procedures must
 * reference saved points with unique ids. Superseded legacy drafts read
 * from old payloads are dropped here. */
function normalizeProcedures(
  procedures: readonly z.infer<typeof persistedProcedureSchema>[],
  stopIds: ReadonlySet<string>,
  stationIds: ReadonlySet<string>,
): CommuteProcedure[] {
  const seenIds = new Set<string>();
  const normalized: CommuteProcedure[] = [];
  for (const procedure of procedures) {
    let referencesSavedPoints: boolean;
    switch (procedure.kind) {
      case "legacy-draft":
        continue;
      case "auto":
        referencesSavedPoints = procedure.points.every((point) =>
          point.type === "stop"
            ? stopIds.has(point.stopId)
            : stationIds.has(point.stationId),
        );
        break;
      case "ready":
        referencesSavedPoints = procedure.steps.every((step) =>
          step.kind === "walk"
            ? true
            : step.kind === "bus"
              ? stopIds.has(step.stopId)
              : stationIds.has(step.stationId),
        );
        break;
    }
    if (!referencesSavedPoints || seenIds.has(procedure.id)) {
      continue;
    }
    seenIds.add(procedure.id);
    normalized.push(procedure);
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
  collection: z.infer<typeof persistedCollectionSchema>,
): DirectionCollection {
  const places = collection.places.map((place) => {
    const stopIds = new Set(place.stops.map((stop) => stop.id));
    const stationIds = new Set(
      place.subwayStations.map((station) => station.id),
    );
    const selectedStopId =
      place.selectedStopId !== null && stopIds.has(place.selectedStopId)
        ? place.selectedStopId
        : (place.stops[0]?.id ?? null);
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
      selectedStopId,
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

/** v2/v3 -> v4: places, stops, stations, and selections carry over;
 * superseded route options are discarded, not converted to drafts. */
function migratePreviousCollection(
  collection: z.infer<typeof previousDirectionCollectionSchema>,
): DirectionCollection {
  return normalizeCollection({
    activePlaceId: collection.activePlaceId,
    places: collection.places.map((place) => ({
      ...place,
      location: null,
      procedures: [],
      favorites: [],
      activeProcedureId: null,
    })),
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

function parsePreviousCommutes(stored: string): CommuteStops | null {
  const parsed = previousCommuteStopsSchema.safeParse(parseJson(stored));
  if (!parsed.success) {
    return null;
  }
  return {
    company: migratePreviousCollection(parsed.data.company),
    home: migratePreviousCollection(parsed.data.home),
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

  for (const key of [V3_STORAGE_KEY, V2_STORAGE_KEY]) {
    const previous = store.getItem(key);
    if (previous) {
      const parsed = parsePreviousCommutes(previous);
      if (parsed) {
        return parsed;
      }
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
