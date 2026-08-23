import { describe, expect, it } from "vitest";
import type { TransitSelections } from "@mota/contracts/transit-settings";
import {
  SettingsVersionConflictError,
  type StoredUserSettings,
  type UserSettingsRepository,
} from "@mota/db";
import { GatewayUnavailableError } from "../src/auth/gateway";
import { createApp } from "./create-test-app";

const selections: TransitSelections = {
  busStops: [
    {
      id: "124000454" as TransitSelections["busStops"][number]["id"],
      arsId: "25014" as TransitSelections["busStops"][number]["arsId"],
      name: "천호역",
      lat: 37.5379482005,
      lng: 127.1255385876,
      distanceMeters: 151,
    },
  ],
  subwayStations: [],
  selectedBusStopIds: [
    "124000454" as TransitSelections["selectedBusStopIds"][number],
  ],
  selectedSubwayStationId: null,
};

class MemorySettingsRepository implements UserSettingsRepository {
  readonly records = new Map<string, StoredUserSettings>();

  async find(authUserId: string): Promise<StoredUserSettings | null> {
    return this.records.get(authUserId) ?? null;
  }

  async save(
    authUserId: string,
    expectedVersion: number,
    nextSelections: TransitSelections,
  ): Promise<StoredUserSettings> {
    const current = this.records.get(authUserId);
    if ((current?.version ?? 0) !== expectedVersion) {
      throw new SettingsVersionConflictError();
    }
    const saved = {
      authUserId,
      version: expectedVersion + 1,
      selections: nextSelections,
      updatedAt: "2026-08-23T10:00:00.000Z",
    };
    this.records.set(authUserId, saved);
    return saved;
  }
}

function createSettingsApp(repository = new MemorySettingsRepository()) {
  return {
    repository,
    app: createApp(fetch, {
      settingsRepository: repository,
      verifySession: async (cookie) => {
        const match = /agw-access=(user-[^;]+)/.exec(cookie ?? "");
        return match?.[1] ? { sub: match[1], email: `${match[1]}@example.com` } : null;
      },
    }),
  };
}

describe("authenticated user settings routes", () => {
  it("requires a verified auth-gateway user", async () => {
    const { app } = createSettingsApp();

    expect((await app.request("/api/settings")).status).toBe(401);
    expect(
      (
        await app.request("/api/settings", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ version: 0, selections }),
        })
      ).status,
    ).toBe(401);
  });

  it("reports auth-gateway outages instead of treating them as anonymous", async () => {
    const app = createApp(fetch, {
      settingsRepository: new MemorySettingsRepository(),
      verifySession: async () => {
        throw new GatewayUnavailableError();
      },
    });

    const response = await app.request("/api/settings", {
      headers: { Cookie: "agw-access=token" },
    });
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: "AUTH_GATEWAY_UNAVAILABLE",
    });
  });

  it("stores settings under the shared auth-gateway user id", async () => {
    const { app, repository } = createSettingsApp();

    const savedResponse = await app.request("/api/settings", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Cookie: "agw-access=user-1",
      },
      body: JSON.stringify({ version: 0, selections }),
    });
    expect(savedResponse.status).toBe(200);
    await expect(savedResponse.json()).resolves.toMatchObject({
      version: 1,
      selections,
    });
    expect(repository.records.has("user-1")).toBe(true);
    expect(repository.records.has("user-2")).toBe(false);

    const otherUserResponse = await app.request("/api/settings", {
      headers: { Cookie: "agw-access=user-2" },
    });
    await expect(otherUserResponse.json()).resolves.toEqual({
      version: 0,
      selections: null,
    });

    const originalUserResponse = await app.request("/api/settings", {
      headers: { Cookie: "agw-access=user-1" },
    });
    await expect(originalUserResponse.json()).resolves.toMatchObject({
      version: 1,
      selections,
    });
  });

  it("rejects invalid payloads and stale versions", async () => {
    const { app } = createSettingsApp();
    const headers = {
      "Content-Type": "application/json",
      Cookie: "agw-access=user-1",
    };

    const invalid = await app.request("/api/settings", {
      method: "PUT",
      headers,
      body: JSON.stringify({ version: 0, selections: { busStops: "invalid" } }),
    });
    expect(invalid.status).toBe(400);

    await app.request("/api/settings", {
      method: "PUT",
      headers,
      body: JSON.stringify({ version: 0, selections }),
    });
    const conflict = await app.request("/api/settings", {
      method: "PUT",
      headers,
      body: JSON.stringify({ version: 0, selections }),
    });
    expect(conflict.status).toBe(409);
  });
});
