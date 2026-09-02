import type { TransitSelections } from "@mota/contracts/transit-settings";
import {
  createDatabase,
  DrizzleUserSettingsRepository,
  userSettings,
} from "@mota/db";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { createApp } from "./create-test-app";

const databaseUrl = process.env.DATABASE_URL;
const integration = describe.runIf(Boolean(databaseUrl));

integration("settings API with home-server Postgres", () => {
  const { client, database } = createDatabase(databaseUrl ?? "");
  const repository = new DrizzleUserSettingsRepository(database);
  const firstUser = `api-integration-${crypto.randomUUID()}`;
  const secondUser = `api-integration-${crypto.randomUUID()}`;
  const emptyPointSelections = {
    busStops: [],
    subwayStations: [],
    selectedBusStopIds: [],
    selectedSubwayStationId: null,
  };
  const selections: TransitSelections = {
    commutes: {
      toWork: emptyPointSelections,
      toHome: emptyPointSelections,
    },
  };
  const app = createApp(fetch, {
    settingsRepository: repository,
    verifySession: async (cookie) => {
      const authUserId = /agw-access=([^;]+)/.exec(cookie ?? "")?.[1];
      return authUserId ? { sub: authUserId } : null;
    },
  });

  afterAll(async () => {
    await database
      .delete(userSettings)
      .where(eq(userSettings.authUserId, firstUser));
    await database
      .delete(userSettings)
      .where(eq(userSettings.authUserId, secondUser));
    await client.end();
  });

  it("persists and isolates authenticated users through the HTTP boundary", async () => {
    const saved = await app.request("/api/settings", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Cookie: `agw-access=${firstUser}`,
      },
      body: JSON.stringify({ version: 0, selections }),
    });
    expect(saved.status).toBe(200);

    const first = await app.request("/api/settings", {
      headers: { Cookie: `agw-access=${firstUser}` },
    });
    await expect(first.json()).resolves.toEqual({
      version: 1,
      selections,
    });

    const second = await app.request("/api/settings", {
      headers: { Cookie: `agw-access=${secondUser}` },
    });
    await expect(second.json()).resolves.toEqual({
      version: 0,
      selections: null,
    });
  });
});
