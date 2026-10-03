import { describe, expect, it } from "vitest";
import { authSessionResponseSchema } from "./auth";
import {
  MAX_SELECTED_BUS_STOPS,
  transitSelectionsSchema,
  transitSettingsSnapshotSchema,
} from "./transitSettings";

const legacySelections = {
  busStops: [],
  selectedBusStopIds: [],
};

const emptyContext = {
  busStops: [],
  selectedBusStopIds: [],
};

const selections = {
  commutes: {
    toWork: emptyContext,
    toHome: emptyContext,
  },
};

describe("shared transit settings contracts", () => {
  it("accepts the canonical empty selection document", () => {
    expect(transitSelectionsSchema.parse(selections)).toEqual(selections);
    expect(
      transitSettingsSnapshotSchema.parse({
        version: 0,
        selections: null,
      }),
    ).toEqual({ version: 0, selections: null });
  });

  it("migrates a flat selection document into both commute contexts", () => {
    expect(transitSelectionsSchema.parse(legacySelections)).toEqual(selections);
  });

  it("migrates the singular selectedBusStopId document to a one-element list", () => {
    expect(
      transitSelectionsSchema.parse({
        busStops: [],
        selectedBusStopId: "124000454",
      }),
    ).toEqual({
      commutes: {
        toWork: {
          ...emptyContext,
          selectedBusStopIds: ["124000454"],
        },
        toHome: {
          ...emptyContext,
          selectedBusStopIds: ["124000454"],
        },
      },
    });
  });

  it("preserves buses and versions while ignoring malformed retired subway fields", () => {
    const busStop = {
      id: "124000454",
      arsId: "09123",
      name: "정류장",
      lat: 37.5,
      lng: 127,
      distanceMeters: 20,
    };
    const point = { busStops: [busStop], selectedBusStopIds: [busStop.id] };
    expect(
      transitSettingsSnapshotSchema.parse({
        version: 7,
        selections: {
          commutes: {
            toWork: { ...point, subwayStations: "broken", selectedSubwayStationId: {} },
            toHome: { ...emptyContext, subwayStations: null, selectedSubwayStationId: 3 },
          },
        },
      }),
    ).toEqual({ version: 7, selections: { commutes: { toWork: point, toHome: emptyContext } } });
    expect(
      transitSelectionsSchema.safeParse({
        ...point,
        busStops: [{ ...busStop, lat: "invalid" }],
        subwayStations: "broken",
      }).success,
    ).toBe(false);
  });

  it("rejects watching more stops than the product cap", () => {
    expect(
      transitSelectionsSchema.safeParse({
        commutes: {
          ...selections.commutes,
          toWork: {
            ...emptyContext,
            selectedBusStopIds: Array.from(
              { length: MAX_SELECTED_BUS_STOPS + 1 },
              (_, index) => `stop-${index}`,
            ),
          },
        },
      }).success,
    ).toBe(false);
  });

  it("deduplicates repeated stop ids while migrating", () => {
    expect(
      transitSelectionsSchema.parse({
        ...legacySelections,
        selectedBusStopIds: ["124000454", "124000454"],
      }),
    ).toEqual({
      commutes: {
        toWork: {
          ...emptyContext,
          selectedBusStopIds: ["124000454"],
        },
        toHome: {
          ...emptyContext,
          selectedBusStopIds: ["124000454"],
        },
      },
    });
  });

  it("rejects malformed selection arrays and negative versions", () => {
    expect(
      transitSelectionsSchema.safeParse({
        ...legacySelections,
        busStops: "invalid",
      }).success,
    ).toBe(false);
    expect(
      transitSettingsSnapshotSchema.safeParse({
        version: -1,
        selections,
      }).success,
    ).toBe(false);
  });

  it("requires user identity on authenticated sessions", () => {
    expect(
      authSessionResponseSchema.parse({
        authenticated: true,
        user: { sub: "auth-user-1", email: "user@example.com" },
      }),
    ).toMatchObject({ authenticated: true });
    expect(
      authSessionResponseSchema.safeParse({
        authenticated: true,
      }).success,
    ).toBe(false);
  });
});
