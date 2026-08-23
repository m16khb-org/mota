import { describe, expect, it } from "vitest";
import { gatewaySessionResponseSchema } from "./auth";
import {
  transitSelectionsSchema,
  transitSettingsSnapshotSchema,
} from "./transitSettings";

const selections = {
  busStops: [],
  subwayStations: [],
  selectedBusStopId: null,
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
