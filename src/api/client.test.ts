import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchNearbySubwayStations } from "./client";

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
