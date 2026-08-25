import type { TransitSelections } from "@mota/contracts/transit-settings";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { createDatabase } from "./client";
import {
  DrizzleUserSettingsRepository,
  SettingsVersionConflictError,
} from "./repository";
import { userSettings } from "./schema";

const databaseUrl = process.env.DATABASE_URL;
const integration = describe.runIf(Boolean(databaseUrl));

integration("DrizzleUserSettingsRepository", () => {
  const { client, database } = createDatabase(databaseUrl ?? "");
  const repository = new DrizzleUserSettingsRepository(database);
  const firstUser = `integration-${crypto.randomUUID()}`;
  const secondUser = `integration-${crypto.randomUUID()}`;
  const emptyPointSelections = {
    busStops: [],
    subwayStations: [],
    selectedBusStopIds: [],
    selectedSubwayStationId: null,
  };
  const emptySelections: TransitSelections = {
    commutes: {
      toWork: emptyPointSelections,
      toHome: emptyPointSelections,
    },
  };

  afterAll(async () => {
    await database
      .delete(userSettings)
      .where(eq(userSettings.authUserId, firstUser));
    await database
      .delete(userSettings)
      .where(eq(userSettings.authUserId, secondUser));
    await client.end();
  });

  it("isolates Supabase users and enforces versions", async () => {
    const first = await repository.save(firstUser, 0, emptySelections);
    const second = await repository.save(secondUser, 0, emptySelections);

    expect(first).toMatchObject({ authUserId: firstUser, version: 1 });
    expect(second).toMatchObject({ authUserId: secondUser, version: 1 });
    await expect(repository.find(firstUser)).resolves.toMatchObject({
      authUserId: firstUser,
      version: 1,
    });
    await expect(repository.find("missing-user")).resolves.toBeNull();
    await expect(
      repository.save(firstUser, 0, emptySelections),
    ).rejects.toBeInstanceOf(SettingsVersionConflictError);
  });
});
