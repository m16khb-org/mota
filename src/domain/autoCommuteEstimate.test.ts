import { describe, expect, it } from "vitest";
import { autoCommuteProcedureSchema } from "./commute";
import {
  deriveAutoCommutePlan,
  type ResolvedAutoPoint,
} from "./autoCommuteEstimate";
import type { BusArrival } from "./bus";
import type { SubwayArrival } from "./subway";

const MINUTE = 60_000;

function makeBusArrival(
  routeName: string,
  direction: string,
  seconds: number,
): BusArrival {
  return {
    id: `${routeName}-${direction}`,
    routeId: routeName,
    routeName,
    direction,
    first: { seconds, message: `${seconds}초후` },
    second: null,
  } as unknown as BusArrival;
}

function makeSubwayArrival(
  line: string,
  trainLineNm: string,
  seconds: number,
): SubwayArrival {
  return {
    id: `${line}-${trainLineNm}`,
    subwayId: line,
    updnLine: "상행",
    line,
    direction: trainLineNm,
    trainLineNm,
    trainStatus: "전역진입",
    seconds,
    message: `${seconds}초`,
    location: null,
    isLastTrain: false,
  } as unknown as SubwayArrival;
}

const origin = { lat: 37.5205, lng: 127.1 };
/** ~55 m from the origin: a 1-minute walk to the first boarding. */
const stopA: ResolvedAutoPoint = {
  pointId: "stop-a",
  kind: "stop",
  name: "집앞 정류장",
  lat: 37.52,
  lng: 127.1,
  arsId: "25015" as never,
};
/** ~1.1 km south of stop A: bus ride ≈ 7 min with detour. */
const stationB: ResolvedAutoPoint = {
  pointId: "station-b",
  kind: "station",
  name: "천호역",
  lat: 37.51,
  lng: 127.1005,
};

const procedure = autoCommuteProcedureSchema.parse({
  id: "proc-1",
  kind: "auto",
  name: "아침",
  points: [
    { type: "stop", stopId: "stop-a", arsId: "25015" },
    { type: "station", stationId: "station-b", apiStationName: "천호" },
  ],
});

const now = Date.parse("2026-08-22T10:00:00+09:00");

describe("deriveAutoCommutePlan", () => {
  it("picks the route whose direction heads to the next point, computes walk, wait, ride, and leave-by", () => {
    const successAt = now - 10_000;
    const plan = deriveAutoCommutePlan({
      procedure,
      points: [stopA, stationB],
      origin,
      now,
      busArrivals: [
        {
          stopId: "stop-a" as never,
          arrivals: [
            makeBusArrival("63", "반대방향", 120),
            makeBusArrival("341", "천호역", 200),
          ],
          successAt,
          latestAttemptFailed: false,
        },
      ],
    });

    expect(plan).not.toBeNull();
    expect(plan?.originWalkMinutes).toBeGreaterThan(0);
    const leg = plan?.legs[0];
    expect(leg?.kind).toBe("bus");
    // 341 beats 63 despite arriving later: it heads to 천호역.
    expect(leg?.routeLabel).toContain("341");
    expect(leg?.basis).toBe("live");
    expect(leg?.rideMinutes).toBeGreaterThan(0);
    // Leave-by = boarding (successAt+200s = now+190s) minus the 1-min walk.
    expect(plan?.leaveBy).toBe(now + 130_000);
    expect(plan?.arrivalAt).toBe(leg?.endAt);
    expect(plan?.originMissing).toBe(false);
  });

  it("falls back to the earliest departure when no direction matches, still live", () => {
    const successAt = now - 10_000;
    const plan = deriveAutoCommutePlan({
      procedure,
      points: [stopA, stationB],
      origin: null,
      now,
      busArrivals: [
        {
          stopId: "stop-a" as never,
          arrivals: [makeBusArrival("63", "성수동", 120)],
          successAt,
          latestAttemptFailed: false,
        },
      ],
    });
    const leg = plan?.legs[0];
    expect(leg?.routeLabel).toContain("63");
    expect(leg?.basis).toBe("live");
    // No origin: no walk, no leave guidance.
    expect(plan?.originMissing).toBe(true);
    expect(plan?.originWalkMinutes).toBeNull();
    expect(plan?.leaveBy).toBeNull();
  });

  it("uses honest fallback waits when no live snapshot exists", () => {
    const plan = deriveAutoCommutePlan({
      procedure,
      points: [stopA, stationB],
      origin,
      now,
    });
    const leg = plan?.legs[0];
    expect(leg?.routeLabel).toBeNull();
    expect(leg?.basis).toBe("estimated");
    expect(leg?.waitSeconds).toBe(5 * 60);
    expect(plan?.arrivalAt).not.toBeNull();
  });

  it("treats a station boarding as subway and uses the subway fallback wait", () => {
    const stationFirst: ResolvedAutoPoint = { ...stationB };
    const stopNext: ResolvedAutoPoint = { ...stopA };
    const subwayProcedure = autoCommuteProcedureSchema.parse({
      id: "proc-2",
      kind: "auto",
      name: "역에서 시작",
      points: [
        { type: "station", stationId: "station-b", apiStationName: "천호" },
        { type: "stop", stopId: "stop-a", arsId: "25015" },
      ],
    });
    const successAt = now - 10_000;
    const plan = deriveAutoCommutePlan({
      procedure: subwayProcedure,
      points: [stationFirst, stopNext],
      origin: { lat: 37.5105, lng: 127.1005 },
      now,
      subwayArrivals: [
        {
          stationId: "station-b" as never,
          arrivals: [makeSubwayArrival("5호선", "방화행", 90)],
          successAt,
          latestAttemptFailed: false,
        },
      ],
    });
    const leg = plan?.legs[0];
    expect(leg?.kind).toBe("subway");
    expect(leg?.routeLabel).toContain("5호선");
    expect(leg?.basis).toBe("live");
  });

  it("marks stale snapshots as stale and keeps computing with fallback waits", () => {
    const plan = deriveAutoCommutePlan({
      procedure,
      points: [stopA, stationB],
      origin,
      now,
      busArrivals: [
        {
          stopId: "stop-a" as never,
          arrivals: [makeBusArrival("341", "천호역", 100)],
          successAt: now - 10 * MINUTE,
          latestAttemptFailed: true,
        },
      ],
    });
    expect(plan?.legs[0]?.basis).toBe("stale");
    expect(plan?.legs[0]?.routeLabel).toBeNull();
  });
});
