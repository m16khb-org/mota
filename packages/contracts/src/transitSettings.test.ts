import { describe, expect, it } from "vitest";
import { gatewaySessionResponseSchema } from "./auth";
import {
  MAX_SELECTED_BUS_STOPS,
  transitSelectionsSchema,
  transitSettingsSnapshotSchema,
} from "./transitSettings";

const selections = {
  busStops: [],
  subwayStations: [],
  selectedBusStopIds: [],
  selectedSubwayStationId: null,
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

  it("migrates the singular selectedBusStopId document to a one-element list", () => {
    expect(
      transitSelectionsSchema.parse({
        busStops: [],
        subwayStations: [],
        selectedBusStopId: "124000454",
        selectedSubwayStationId: null,
      }),
    ).toEqual({
      ...selections,
      selectedBusStopIds: ["124000454"],
    });
  });

  it("rejects watching more stops than the product cap", () => {
    expect(
      transitSelectionsSchema.safeParse({
        ...selections,
        selectedBusStopIds: Array.from(
          { length: MAX_SELECTED_BUS_STOPS + 1 },
          (_, index) => `stop-${index}`,
        ),
      }).success,
    ).toBe(false);
  });

  it("deduplicates repeated stop ids while migrating", () => {
    expect(
      transitSelectionsSchema.parse({
        ...selections,
        selectedBusStopIds: ["124000454", "124000454"],
      }),
    ).toEqual({ ...selections, selectedBusStopIds: ["124000454"] });
  });

  it("rejects malformed selection arrays and negative versions", () => {
    expect(
      transitSelectionsSchema.safeParse({
        ...selections,
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

  it("requires auth-gateway identity on authenticated sessions", () => {
    expect(
      gatewaySessionResponseSchema.parse({
        authenticated: true,
        user: { sub: "auth-user-1", email: "user@example.com" },
      }),
    ).toMatchObject({ authenticated: true });
    expect(
      gatewaySessionResponseSchema.safeParse({
        authenticated: true,
      }).success,
    ).toBe(false);
  });
});
