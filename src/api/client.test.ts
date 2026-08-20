import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, fetchNearbySubwayStations, fetchNearbyStops, isServiceAreaError } from "./client";

describe("api client error mapping", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("surfaces INVALID_LOCATION so callers can explain the service boundary", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: "INVALID_LOCATION" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    const error: unknown = await fetchNearbyStops({
      lat: 37.2636,
      lng: 127.0286,
    }).then(
      () => null,
      (reason: unknown) => reason,
    );

    expect(error).toBeInstanceOf(ApiError);
    expect(isServiceAreaError(error)).toBe(true);
  });

  it("treats bodies without an error code as generic failures", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 503 })),
    );

    const error: unknown = await fetchNearbyStops({
      lat: 37.5663,
      lng: 126.9779,
    }).then(
      () => null,
      (reason: unknown) => reason,
    );

    expect(error).toBeInstanceOf(ApiError);
    expect(isServiceAreaError(error)).toBe(false);
  });
});

describe("fetchNearbySubwayStations", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("allows 20s for Overpass-backed searches instead of the default 8s", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        stations: [
          {
            id: "osm-node-5801572034",
            name: "천호",
            line: "수도권 전철",
            lat: 37.5385225,
            lng: 127.1234021,
            distanceMeters: 240,
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const timeoutSpy = vi.spyOn(AbortSignal, "timeout");

    const stations = await fetchNearbySubwayStations({
      lat: 37.5366,
      lng: 127.1253,
    });

    expect(stations).toHaveLength(1);
    expect(timeoutSpy).toHaveBeenCalledWith(20_000);
  });
});
