// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchTransitSettings,
  saveTransitSettings,
} from "../api/client";
import type { BusStop } from "../domain/bus";
import type { TransitSelections } from "@mota/contracts/transit-settings";
import type { GatewaySessionState } from "./useGatewaySession";
import { useTransitSelections } from "./useTransitSelections";

vi.mock("../api/client", async (importOriginal) => {
  const original = await importOriginal<typeof import("../api/client")>();
  return {
    ...original,
    fetchTransitSettings: vi.fn(),
    saveTransitSettings: vi.fn(),
  };
});

const localStop: BusStop = {
  id: "local-stop" as BusStop["id"],
  arsId: "25014" as BusStop["arsId"],
  name: "로컬 정류장",
  lat: 37.53,
  lng: 127.12,
  distanceMeters: 100,
};
const serverStop: BusStop = {
  id: "server-stop" as BusStop["id"],
  arsId: "25015" as BusStop["arsId"],
  name: "서버 정류장",
  lat: 37.54,
  lng: 127.13,
  distanceMeters: 200,
};
const localSelections: TransitSelections = {
  busStops: [localStop],
  subwayStations: [],
  selectedBusStopId: localStop.id,
  selectedSubwayStationId: null,
};
const serverSelections: TransitSelections = {
  busStops: [serverStop],
  subwayStations: [],
  selectedBusStopId: serverStop.id,
  selectedSubwayStationId: null,
};
const authenticatedSession: GatewaySessionState = {
  authenticated: true,
  checked: true,
  user: { sub: "auth-user-1", email: "user@example.com" },
  error: null,
};
const anonymousSession: GatewaySessionState = {
  authenticated: false,
  checked: true,
  user: null,
  error: null,
};

describe("useTransitSelections authenticated synchronization", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem(
      "mota:transit-selections:v1",
      JSON.stringify(localSelections),
    );
    vi.mocked(fetchTransitSettings).mockReset();
    vi.mocked(saveTransitSettings).mockReset();
  });

  it("loads the authenticated user's server settings without replacing anonymous storage", async () => {
    vi.mocked(fetchTransitSettings).mockResolvedValue({
      version: 2,
      selections: serverSelections,
    });

    const { result } = renderHook(() =>
      useTransitSelections(authenticatedSession),
    );

    await waitFor(() =>
      expect(result.current.selections).toEqual(serverSelections),
    );
    expect(result.current.syncStatus).toBe("synced");
    expect(JSON.parse(localStorage.getItem("mota:transit-selections:v1") ?? "")).toEqual(
      localSelections,
    );
  });

  it("bootstraps an empty server account from the anonymous local settings", async () => {
    vi.mocked(fetchTransitSettings).mockResolvedValue({
      version: 0,
      selections: null,
    });
    vi.mocked(saveTransitSettings).mockResolvedValue({
      version: 1,
      selections: localSelections,
    });

    const { result } = renderHook(() =>
      useTransitSelections(authenticatedSession),
    );

    await waitFor(() =>
      expect(saveTransitSettings).toHaveBeenCalledWith({
        version: 0,
        selections: localSelections,
      }),
    );
    await waitFor(() => expect(result.current.syncStatus).toBe("synced"));
  });

  it("serializes authenticated mutations with the current server version", async () => {
    vi.mocked(fetchTransitSettings).mockResolvedValue({
      version: 2,
      selections: serverSelections,
    });
    vi.mocked(saveTransitSettings).mockImplementation(async (update) => ({
      version: update.version + 1,
      selections: update.selections,
    }));
    const nextStop: BusStop = {
      ...localStop,
      id: "next-stop" as BusStop["id"],
      arsId: "25016" as BusStop["arsId"],
      name: "추가 정류장",
    };
    const { result } = renderHook(() =>
      useTransitSelections(authenticatedSession),
    );
    await waitFor(() =>
      expect(result.current.selections).toEqual(serverSelections),
    );

    act(() => result.current.addBusStops([nextStop]));

    await waitFor(() =>
      expect(saveTransitSettings).toHaveBeenCalledWith({
        version: 2,
        selections: expect.objectContaining({
          selectedBusStopId: nextStop.id,
          busStops: [serverStop, nextStop],
        }),
      }),
    );
    await waitFor(() => expect(result.current.syncStatus).toBe("synced"));
  });

  it("restores anonymous settings after logout without exposing the previous user", async () => {
    vi.mocked(fetchTransitSettings).mockResolvedValue({
      version: 2,
      selections: serverSelections,
    });
    const { result, rerender } = renderHook(
      ({ session }: { session: GatewaySessionState }) =>
        useTransitSelections(session),
      { initialProps: { session: authenticatedSession } },
    );
    await waitFor(() =>
      expect(result.current.selections).toEqual(serverSelections),
    );

    rerender({ session: anonymousSession });

    await waitFor(() =>
      expect(result.current.selections).toEqual(localSelections),
    );
  });
});
