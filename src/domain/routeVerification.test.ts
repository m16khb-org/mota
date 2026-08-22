import { describe, expect, it } from "vitest";
import type { ArsId, BusRouteStation, StopId } from "./bus";
import { normalizeRouteStations } from "./bus";
import { terminusMatches, verifyRouteLeg } from "./routeVerification";

function station(
  seq: number,
  arsId: string,
  name: string,
  lat: number,
): BusRouteStation {
  return {
    seq,
    stopId: `${arsId}-id` as StopId,
    arsId: arsId as ArsId,
    name,
    lat,
    lng: 127.1,
    direction: "종점행",
    sectSpdKmh: null,
    sectionMeters: null,
  };
}

/** A route running south: 강변 → 천호 → 강동 → 미사, bound 종점행. */
const southbound = [
  station(1, "11111", "강변", 37.54),
  station(2, "22222", "천호", 37.53),
  station(3, "33333", "강동구청", 37.52),
  station(4, "44444", "미사", 37.51),
];

describe("normalizeRouteStations", () => {
  it("parses upstream rows into ordered WGS84 stations", () => {
    const stations = normalizeRouteStations({
      resultList: [
        {
          seq: "2",
          station: "121000901",
          arsId: "22222",
          stationNm: "천호",
          gpsX: "127.1",
          gpsY: "37.53",
          direction: "종점행",
        },
        {
          seq: "1",
          station: "121000902",
          arsId: "11111",
          stationNm: "강변",
          gpsX: "127.1",
          gpsY: "37.54",
          direction: "종점행",
        },
      ],
    });
    expect(stations.map((s) => s.seq)).toEqual([1, 2]);
    expect(stations[0]).toMatchObject({ name: "강변", lat: 37.54, lng: 127.1 });
  });

  it("normalizes an unknown route's null list to an empty list", () => {
    expect(normalizeRouteStations({ resultList: null })).toEqual([]);
  });
});

describe("verifyRouteLeg", () => {
  it("verifies a forward leg with path distance, alighting stop, and tail walk", () => {
    // Boarding at 천호, waypoint at 강동구청근처 (slightly off-station).
    const verification = verifyRouteLeg({
      stations: southbound,
      fromArsId: "22222" as ArsId,
      to: { lat: 37.5201, lng: 127.1 },
    });
    expect(verification).not.toBeNull();
    expect(verification?.alightName).toBe("강동구청");
    // 천호→강동구청 straight line ≈ 1112 m; path over the route list = same
    // two stops, so pathMeters ≈ 1112 and minutes = ceil(1112/300) = 4.
    expect(verification?.pathMinutes).toBe(4);
    expect(verification?.boundTermini).toContain("종점행");
    // Waypoint sits ~11 m from the alighting stop: below the meaningful-walk
    // threshold, so no tail is added.
    expect(verification?.tailWalkMinutes).toBe(0);
  });

  it("verifies the reversed ordering with the first stop as bound terminus", () => {
    // Boarding at 강동구청 heading north to 천호.
    const verification = verifyRouteLeg({
      stations: southbound,
      fromArsId: "33333" as ArsId,
      to: { lat: 37.53, lng: 127.1 },
    });
    expect(verification).not.toBeNull();
    expect(verification?.alightName).toBe("천호");
    // Reversed travel is bound for the list's first stop (강변).
    expect(verification?.boundTermini).toEqual(["강변"]);
  });

  it("rejects when no route stop is near the waypoint", () => {
    const verification = verifyRouteLeg({
      stations: southbound,
      fromArsId: "22222" as ArsId,
      to: { lat: 37.6, lng: 127.1 }, // far off the route
    });
    expect(verification).toBeNull();
  });

  it("rejects when the boarding stop is not on the route", () => {
    const verification = verifyRouteLeg({
      stations: southbound,
      fromArsId: "99999" as ArsId,
      to: { lat: 37.52, lng: 127.1 },
    });
    expect(verification).toBeNull();
  });
});

describe("terminusMatches", () => {
  it("matches direction labels against the required terminus across suffix noise", () => {
    expect(terminusMatches("강동공영차고지", ["강동공영차고지"])).toBe(true);
    expect(terminusMatches("천호역 정류장", ["천호"])).toBe(true);
    expect(terminusMatches("강변", ["종점행"])).toBe(false);
  });
});

describe("normalizeRouteStations real-world rows", () => {
  it("drops non-stopping (미정차) rows with blank ARS ids", () => {
    const stations = normalizeRouteStations({
      resultList: [
        {
          seq: "15",
          station: "277103196",
          arsId: " ",
          stationNm: "신천IC(미정차)",
          gpsX: "126.9",
          gpsY: "37.5",
          direction: "종점행",
        },
        {
          seq: "16",
          station: "121000901",
          arsId: "11111",
          stationNm: "강변",
          gpsX: "127.1",
          gpsY: "37.54",
          direction: "종점행",
        },
      ],
    });
    expect(stations).toHaveLength(1);
    expect(stations[0]?.name).toBe("강변");
  });
});

describe("verifyRouteLeg per-segment speeds", () => {
  it("uses real road distances and live section speeds over haversine defaults", () => {
    const withSegments = southbound.map((stop, index) => ({
      ...stop,
      // 천호(2) → 강동구청(3): 500 m of road at 12 km/h = 2.5 min.
      // 천호 index 1 is board, 강동구청 index 2 is alight.
      sectionMeters: index === 1 ? 500 : null,
      sectSpdKmh: index === 1 ? 12 : null,
    }));
    const verification = verifyRouteLeg({
      stations: withSegments,
      fromArsId: "22222" as ArsId,
      to: { lat: 37.52, lng: 127.1 },
    });
    expect(verification).not.toBeNull();
    expect(verification?.pathMeters).toBe(500);
    expect(verification?.pathMinutes).toBe(3); // 500m @12km/h = 2.5 → ceil 3
  });

  it("clamps absurd live speeds into a sane window", () => {
    const withSegments = southbound.map((stop, index) => ({
      ...stop,
      sectionMeters: index === 1 ? 3000 : null,
      sectSpdKmh: index === 1 ? 500 : null, // bad sensor reading
    }));
    const verification = verifyRouteLeg({
      stations: withSegments,
      fromArsId: "22222" as ArsId,
      to: { lat: 37.52, lng: 127.1 },
    });
    // 3000 m clamped to 60 km/h = 3 min (not 0).
    expect(verification?.pathMinutes).toBe(3);
  });
});
