import { describe, expect, it } from "vitest";
import { authSessionResponseSchema } from "./auth";
import {
  MAX_SELECTED_BUS_STOPS,
  transitSelectionsSchema,
  transitSettingsSnapshotSchema,
} from "./transitSettings";

const legacySelections = {
  busStops: [],
  subwayStations: [],
  selectedBusStopIds: [],
  selectedSubwayStationId: null,
};

const emptyContext = {
  busStops: [],
  subwayStations: [],
  selectedBusStopIds: [],
  selectedSubwayStationId: null,
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
    expect(transitSelectionsSchema.parse(legacySelections)).toEqual(
      selections,
    );
  });

  it("migrates the singular selectedBusStopId document to a one-element list", () => {
    expect(
      transitSelectionsSchema.parse({
        busStops: [],
        subwayStations: [],
        selectedBusStopId: "124000454",
        selectedSubwayStationId: null,
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
