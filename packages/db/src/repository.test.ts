import { describe, expect, it } from "vitest";
import { DrizzleUserSettingsRepository, InvalidStoredSettingsError } from "./repository";

function repositoryWithSelections(selections: unknown) {
  const database = {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => [
            {
              authUserId: "supabase-user",
              version: 8,
              selections,
              updatedAt: new Date("2026-01-01T00:00:00Z"),
            },
          ],
        }),
      }),
    }),
  };
  return new DrizzleUserSettingsRepository(
    database as unknown as ConstructorParameters<typeof DrizzleUserSettingsRepository>[0],
  );
}

describe("stored bus selections", () => {
  it("reads old flat JSON without losing buses or the CAS version", async () => {
    const stop = {
      id: "stop-1",
      arsId: "12345",
      name: "Bus stop",
      lat: 37.5,
      lng: 127,
      distanceMeters: 0,
    };
    const point = { busStops: [stop], selectedBusStopIds: [stop.id] };
    const repository = repositoryWithSelections({
      busStops: [stop],
      selectedBusStopId: stop.id,
      subwayStations: "retired malformed value",
      selectedSubwayStationId: {},
    });
    await expect(repository.find("supabase-user")).resolves.toEqual({
      authUserId: "supabase-user",
      version: 8,
      selections: { commutes: { toWork: point, toHome: point } },
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
  });

  it("continues rejecting malformed bus JSON", async () => {
    await expect(
      repositoryWithSelections({ busStops: "invalid" }).find("supabase-user"),
    ).rejects.toBeInstanceOf(InvalidStoredSettingsError);
  });
});
