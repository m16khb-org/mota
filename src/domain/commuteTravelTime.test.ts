import { describe, expect, it } from "vitest";
import {
  haversineMeters,
  suggestBusRideMinutes,
  suggestSubwayRideMinutes,
  suggestWalkMinutes,
  type TravelPoint,
} from "./commuteTravelTime";

/** One degree of latitude with R = 6 371 000 m. */
const DEGREE_LAT_METERS = 111_194.93;

function latPoint(lat: number): TravelPoint {
  return { lat, lng: 127.1253 };
}

describe("haversineMeters", () => {
  it("measures one degree of latitude as the meridian arc", () => {
    const meters = haversineMeters(latPoint(37.5), latPoint(38.5));
    expect(meters).toBeCloseTo(DEGREE_LAT_METERS, -2);
  });

  it("returns zero for identical points", () => {
    expect(haversineMeters(latPoint(37.5), latPoint(37.5))).toBe(0);
  });
});

describe("suggestWalkMinutes", () => {
  it("rounds a 2.6-minute walk up to a whole minute", () => {
    // 0.002° lat ≈ 222 m → 222/75 = 2.97 → 3.
    expect(suggestWalkMinutes(latPoint(37.5), latPoint(37.502))).toBe(3);
  });

  it("clamps short-but-meaningful walks to at least one minute", () => {
    // 0.0006° lat ≈ 66.7 m → 0.89 → 1.
    expect(suggestWalkMinutes(latPoint(37.5), latPoint(37.5006))).toBe(1);
  });

  it("returns null for coincident points", () => {
    expect(suggestWalkMinutes(latPoint(37.5), latPoint(37.5))).toBeNull();
  });
});

describe("suggestBusRideMinutes", () => {
  it("applies the surface detour factor", () => {
    // 0.02° lat ≈ 2223.9 m → ×1.4 / 250 = 12.45 → 13.
    expect(suggestBusRideMinutes(latPoint(37.5), latPoint(37.52))).toBe(13);
  });
});

describe("suggestSubwayRideMinutes", () => {
  it("applies the rail detour factor", () => {
    // 0.1° lat ≈ 11119.5 m → ×1.25 / 550 = 25.27 → 26.
    expect(suggestSubwayRideMinutes(latPoint(37.5), latPoint(37.6))).toBe(26);
  });

  it("returns null when both anchors are the same station", () => {
    expect(suggestSubwayRideMinutes(latPoint(37.5), latPoint(37.5))).toBeNull();
  });
});
