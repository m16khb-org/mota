import { describe, expect, it } from "vitest";
import type { BusArrival, RouteId, StopId } from "./bus";
import { commuteProcedureSchema } from "./commute";
import type { CommuteProcedureId, CommuteStepId } from "./commute";
import {
  estimateCommuteProcedure,
  type BusArrivalsSource,
  type CommuteEstimateProcedure,
  type SubwayArrivalsSource,
} from "./commuteEstimate";
import type { SubwayArrival, SubwayStation } from "./subway";

/** Fixed epoch clock; no test reads the real time. */
const at = (hour: number, minute = 0, day = 20): number =>
  Date.UTC(2026, 7, day, hour, minute);

const NOW = at(7, 50);

const STOP_ID = "124000454" as StopId;
const STATION_ID = "osm-node-2095165702" as SubwayStation["id"];
const BUS_ROUTE_ID = "100100574" as RouteId;
const BUS_DIRECTION = "강동공영차고지";

const prediction = (seconds: number | null): BusArrival["first"] => ({
  message: seconds === null ? "운행 종료" : `${seconds}초 후`,
  seconds,
  remainingStops: null,
  congestion: null,
});

const busArrival = (options: {
  readonly routeId: string;
  readonly direction?: string;
  readonly first: number | null;
  readonly second?: number | null;
}): BusArrival => ({
  routeId: options.routeId as RouteId,
  routeName: `route-${options.routeId}`,
  direction: options.direction ?? BUS_DIRECTION,
  routeType: "3",
  lowFloor: false,
  first: prediction(options.first),
  second:
    options.second === undefined ? null : prediction(options.second),
});

const subwayArrival = (options: {
  readonly subwayId?: string;
  readonly updnLine?: string;
  readonly seconds: number | null;
}): SubwayArrival => ({
  id: `${options.subwayId ?? "1002"}-${options.updnLine ?? "하행"}-강남방면`,
  subwayId: options.subwayId ?? "1002",
  updnLine: options.updnLine ?? "하행",
  line: "2호선",
  direction: "강남방면",
  trainLineNm: "강남방면",
  trainStatus: "일반",
  seconds: options.seconds,
  message: `${options.seconds ?? "?"}초 후`,
  location: null,
  isLastTrain: false,
});

const busSource = (overrides: {
  readonly arrivals?: readonly BusArrival[] | null;
  readonly successAt?: number | null;
  readonly latestAttemptFailed?: boolean;
  readonly stopId?: StopId;
} = {}): BusArrivalsSource => ({
  stopId: overrides.stopId ?? STOP_ID,
  arrivals:
    overrides.arrivals === undefined
      ? [busArrival({ routeId: BUS_ROUTE_ID, first: 300, second: 900 })]
      : overrides.arrivals,
  successAt:
    overrides.successAt === undefined ? NOW : overrides.successAt,
  latestAttemptFailed: overrides.latestAttemptFailed ?? false,
});

const subwaySource = (overrides: {
  readonly arrivals?: readonly SubwayArrival[] | null;
  readonly successAt?: number | null;
  readonly latestAttemptFailed?: boolean;
  readonly stationId?: SubwayStation["id"];
} = {}): SubwayArrivalsSource => ({
  stationId: overrides.stationId ?? STATION_ID,
  arrivals:
    overrides.arrivals === undefined
      ? [subwayArrival({ seconds: 1680 })]
      : overrides.arrivals,
  successAt:
    overrides.successAt === undefined ? NOW : overrides.successAt,
  latestAttemptFailed: overrides.latestAttemptFailed ?? false,
});

const walk = (id: string, minutes: number) => ({
  id: id as CommuteStepId,
  kind: "walk" as const,
  minutes,
});

const busStep = (fallbackWaitMinutes?: number) => ({
  id: "bus-341" as CommuteStepId,
  kind: "bus" as const,
  stopId: STOP_ID,
  routeId: BUS_ROUTE_ID,
  direction: BUS_DIRECTION,
  rideMinutes: 18,
  ...(fallbackWaitMinutes === undefined
    ? {}
    : { fallbackWaitMinutes }),
});

const subwayStep = (fallbackWaitMinutes?: number) => ({
  id: "subway-2" as CommuteStepId,
  kind: "subway" as const,
  stationId: STATION_ID,
  subwayId: "1002",
  updnLine: "하행",
  rideMinutes: 22,
  ...(fallbackWaitMinutes === undefined
    ? {}
    : { fallbackWaitMinutes }),
});

const estimate = (
  steps: CommuteEstimateProcedure["steps"],
  sources: {
    readonly bus?: readonly BusArrivalsSource[];
    readonly subway?: readonly SubwayArrivalsSource[];
  } = {},
  now: number = NOW,
) =>
  estimateCommuteProcedure({
    procedure: { id: "proc-1" as CommuteProcedureId, steps },
    now,
    ...(sources.bus === undefined ? {} : { busArrivals: sources.bus }),
    ...(sources.subway === undefined
      ? {}
      : { subwayArrivals: sources.subway }),
  });

/** The schema-parsed ready procedure from the Task 1 contract feeds the
 * estimator without any adapter. */
const parsedCompleteProcedure = commuteProcedureSchema.parse({
  id: "proc-morning",
  kind: "ready",
  name: "아침 출근",
  steps: [
    walk("walk-out", 4),
    {
      id: "bus-341" as CommuteStepId,
      kind: "bus",
      stopId: STOP_ID,
      arsId: "25014",
      routeId: BUS_ROUTE_ID,
      routeName: "341",
      direction: BUS_DIRECTION,
      rideMinutes: 18,
      fallbackWaitMinutes: 7,
    },
    walk("walk-transfer", 3),
    {
      id: "subway-2" as CommuteStepId,
      kind: "subway",
      stationId: STATION_ID,
      apiStationName: "천호(풍납토성)",
      subwayId: "1002",
      updnLine: "하행",
      lineName: "2호선",
      trainLineNm: "강남방면",
      rideMinutes: 22,
      fallbackWaitMinutes: 6,
    },
    walk("walk-dest", 4),
  ],
});

describe("estimateCommuteProcedure", () => {
  it("propagates a live 07:55 bus departure through every saved step", () => {
    const result = estimateCommuteProcedure({
      procedure: parsedCompleteProcedure,
      now: NOW,
      busArrivals: [
        busSource({
          arrivals: [
            busArrival({ routeId: "100540012", first: 60 }),
            busArrival({
              routeId: BUS_ROUTE_ID,
              direction: "천호역",
              first: 90,
            }),
            busArrival({ routeId: BUS_ROUTE_ID, first: 300, second: 900 }),
          ],
        }),
      ],
      subwayArrivals: [
        subwaySource({
          arrivals: [
            subwayArrival({ updnLine: "상행", seconds: 60 }),
            subwayArrival({ subwayId: "1008", seconds: 90 }),
            subwayArrival({ seconds: 1680 }),
          ],
        }),
      ],
    });

    expect(result).toEqual({
      procedureId: "proc-morning",
      arrivalAt: at(8, 44),
      leaveBy: at(7, 51),
      blockedAtStepId: null,
      steps: [
        {
          stepId: "walk-out",
          basis: "estimated",
          startAt: NOW,
          waitSeconds: null,
          departureAt: null,
          endAt: at(7, 54),
          matchedCandidate: null,
        },
        {
          stepId: "bus-341",
          basis: "live",
          startAt: at(7, 54),
          waitSeconds: 60,
          departureAt: at(7, 55),
          endAt: at(8, 13),
          matchedCandidate: "100100574:first",
        },
        {
          stepId: "walk-transfer",
          basis: "estimated",
          startAt: at(8, 13),
          waitSeconds: null,
          departureAt: null,
          endAt: at(8, 16),
          matchedCandidate: null,
        },
        {
          stepId: "subway-2",
          basis: "live",
          startAt: at(8, 16),
          waitSeconds: 120,
          departureAt: at(8, 18),
          endAt: at(8, 40),
          matchedCandidate: "1002-하행-강남방면",
        },
        {
          stepId: "walk-dest",
          basis: "estimated",
          startAt: at(8, 40),
          waitSeconds: null,
          departureAt: null,
          endAt: at(8, 44),
          matchedCandidate: null,
        },
      ],
    });
  });

  it("ignores unrelated routes and opposite directions and falls back", () => {
    const result = estimate(
      [walk("walk-out", 4), busStep(7), walk("walk-dest", 2)],
      {
        bus: [
          busSource({
            arrivals: [
              busArrival({ routeId: "100540012", first: 60 }),
              busArrival({
                routeId: BUS_ROUTE_ID,
                direction: "천호역",
                first: 90,
                second: 120,
              }),
            ],
          }),
        ],
      },
    );

    expect(result.leaveBy).toBeNull();
    expect(result.arrivalAt).toBe(at(8, 21));
    expect(result.steps[1]).toEqual({
      stepId: "bus-341",
      basis: "estimated",
      startAt: at(7, 54),
      waitSeconds: 420,
      departureAt: at(8, 1),
      endAt: at(8, 19),
      matchedCandidate: null,
    });
  });

  it("matches a direction after whitespace normalization but not fuzzy text", () => {
    const result = estimate([walk("walk-out", 4), busStep(7), walk("d", 2)], {
      bus: [
        busSource({
          arrivals: [
            busArrival({
              routeId: BUS_ROUTE_ID,
              direction: "  강동공영차고지  ",
              first: 300,
            }),
            busArrival({ routeId: BUS_ROUTE_ID, direction: "강동 공영차고지", first: 30 }),
          ],
        }),
      ],
    });

    expect(result.steps[1]?.basis).toBe("live");
    expect(result.steps[1]?.matchedCandidate).toBe("100100574:first");
    expect(result.steps[1]?.departureAt).toBe(at(7, 55));
  });

  it("selects the matching second prediction when the first is uncatchable", () => {
    const result = estimate([walk("walk-out", 4), busStep(7), walk("d", 2)], {
      bus: [
        busSource({
          // First bus passes at 07:52, readiness is 07:54: uncatchable.
          arrivals: [busArrival({ routeId: BUS_ROUTE_ID, first: 120, second: 600 })],
        }),
      ],
    });

    expect(result.steps[1]).toEqual({
      stepId: "bus-341",
      basis: "live",
      startAt: at(7, 54),
      waitSeconds: 360,
      departureAt: at(8, 0),
      endAt: at(8, 18),
      matchedCandidate: "100100574:second",
    });
    // The 08:00 departure minus the 4-minute access walk.
    expect(result.leaveBy).toBe(at(7, 56));
  });

  it("uses the explicit fallback for a future transfer without a covering prediction", () => {
    const result = estimate(
      [walk("walk-out", 4), busStep(7), walk("walk-transfer", 3), subwayStep(6)],
      {
        bus: [busSource()],
        subway: [
          subwaySource({
            arrivals: [subwayArrival({ seconds: 60 })],
          }),
        ],
      },
    );

    expect(result.leaveBy).toBe(at(7, 51));
    expect(result.arrivalAt).toBe(at(8, 44));
    expect(result.steps[3]).toEqual({
      stepId: "subway-2",
      basis: "estimated",
      startAt: at(8, 16),
      waitSeconds: 360,
      departureAt: at(8, 22),
      endAt: at(8, 44),
      matchedCandidate: null,
    });
  });

  it("never creates leave guidance from stale or unavailable snapshots", () => {
    const stale = estimate([walk("walk-out", 4), busStep(7)], {
      bus: [busSource({ successAt: NOW - 91_000 })],
    });
    expect(stale.leaveBy).toBeNull();
    expect(stale.steps[1]?.basis).toBe("stale");
    expect(stale.steps[1]?.departureAt).toBe(at(8, 1));

    const failedLatest = estimate([walk("walk-out", 4), busStep(7)], {
      bus: [busSource({ successAt: NOW, latestAttemptFailed: true })],
    });
    expect(failedLatest.leaveBy).toBeNull();
    expect(failedLatest.steps[1]?.basis).toBe("stale");

    const unavailable = estimate([walk("walk-out", 4), busStep(7)], {
      bus: [busSource({ arrivals: null, successAt: null })],
    });
    expect(unavailable.leaveBy).toBeNull();
    expect(unavailable.steps[1]?.basis).toBe("unavailable");

    const noSource = estimate([walk("walk-out", 4), busStep(7)]);
    expect(noSource.steps[1]?.basis).toBe("unavailable");
  });

  it("treats the exact 90-second boundary as live and 91 seconds as stale", () => {
    // A 90-second-old snapshot is still live, but its countdowns started at
    // `successAt`, so the covering prediction must account for that age.
    const exactlyLive = estimate([walk("walk-out", 4), busStep(7)], {
      bus: [
        busSource({
          successAt: NOW - 90_000,
          arrivals: [busArrival({ routeId: BUS_ROUTE_ID, first: 600 })],
        }),
      ],
    });
    // Departure 07:58:30 (600s counted from successAt) minus the 4-minute walk.
    expect(exactlyLive.leaveBy).toBe(Date.UTC(2026, 7, 20, 7, 54, 30));
    expect(exactlyLive.steps[1]?.basis).toBe("live");

    const justStale = estimate([walk("walk-out", 4), busStep(7)], {
      bus: [busSource({ successAt: NOW - 90_001 })],
    });
    expect(justStale.leaveBy).toBeNull();
    expect(justStale.steps[1]?.basis).toBe("stale");
  });

  it("does not let response order change the result", () => {
    const bus = [
      busArrival({ routeId: BUS_ROUTE_ID, first: 300, second: 900 }),
      busArrival({ routeId: "100540012", first: 60 }),
    ];
    const subway = [
      subwayArrival({ seconds: 1680 }),
      subwayArrival({ updnLine: "상행", seconds: 60 }),
    ];

    const first = estimate(
      [walk("walk-out", 4), busStep(7), walk("t", 3), subwayStep(6)],
      { bus: [busSource({ arrivals: bus })], subway: [subwaySource({ arrivals: subway })] },
    );
    const second = estimate(
      [walk("walk-out", 4), busStep(7), walk("t", 3), subwayStep(6)],
      {
        bus: [busSource({ arrivals: [...bus].reverse() })],
        subway: [subwaySource({ arrivals: [...subway].reverse() })],
      },
    );

    expect(second).toEqual(first);
  });

  it("crosses midnight with plain epoch timestamps", () => {
    const midnightNow = at(23, 50);
    const result = estimate(
      [walk("walk-out", 10), busStep(15), walk("d", 5)],
      {
        bus: [busSource({ successAt: midnightNow, arrivals: [busArrival({ routeId: BUS_ROUTE_ID, first: 700 })] })],
      },
      midnightNow,
    );

    expect(result.leaveBy).toBe(Date.UTC(2026, 7, 20, 23, 51, 40));
    expect(result.steps[1]?.departureAt).toBe(Date.UTC(2026, 7, 21, 0, 1, 40));
    expect(result.arrivalAt).toBe(Date.UTC(2026, 7, 21, 0, 24, 40));
  });

  it("blocks only the suffix when a step has neither live data nor a fallback", () => {
    const complete = estimate(
      [walk("walk-out", 4), busStep(7), walk("walk-transfer", 3), subwayStep(6), walk("walk-dest", 4)],
      { bus: [busSource()], subway: [subwaySource()] },
    );

    const blocked = estimate(
      [walk("walk-out", 4), busStep(7), walk("walk-transfer", 3), subwayStep(), walk("walk-dest", 4)],
      { bus: [busSource()] },
    );

    expect(blocked.blockedAtStepId).toBe("subway-2");
    expect(blocked.arrivalAt).toBeNull();
    // The calculated prefix survives unchanged, including live leave-by.
    expect(blocked.leaveBy).toBe(complete.leaveBy);
    expect(blocked.steps.slice(0, 3)).toEqual(complete.steps.slice(0, 3));
    expect(blocked.steps[3]).toEqual({
      stepId: "subway-2",
      basis: "unavailable",
      startAt: at(8, 16),
      waitSeconds: null,
      departureAt: null,
      endAt: null,
      matchedCandidate: null,
    });
    expect(blocked.steps[4]).toEqual({
      stepId: "walk-dest",
      basis: "unavailable",
      startAt: null,
      waitSeconds: null,
      departureAt: null,
      endAt: null,
      matchedCandidate: null,
    });

    // A live snapshot that covers none of the future transfer blocks the same
    // suffix; its data exists, so the blocked step is labeled `estimated`.
    const blockedLive = estimate(
      [walk("walk-out", 4), busStep(7), walk("walk-transfer", 3), subwayStep(), walk("walk-dest", 4)],
      { bus: [busSource()], subway: [subwaySource({ arrivals: [] })] },
    );
    expect(blockedLive.blockedAtStepId).toBe("subway-2");
    expect(blockedLive.arrivalAt).toBeNull();
    expect(blockedLive.steps[3]?.basis).toBe("estimated");
    expect(blockedLive.steps[4]?.basis).toBe("unavailable");
  });

  it("keeps arrival matching scoped to the saved stop and station", () => {
    const otherStop = estimate([walk("walk-out", 4), busStep(7)], {
      bus: [busSource({ stopId: "999000001" as StopId })],
    });
    expect(otherStop.steps[1]?.basis).toBe("unavailable");
    expect(otherStop.leaveBy).toBeNull();

    const otherStation = estimate([walk("w", 1), subwayStep(6)], {
      subway: [subwaySource({ stationId: "osm-node-1" as SubwayStation["id"] })],
    });
    expect(otherStation.steps[1]?.basis).toBe("unavailable");
  });
});

describe("leave guidance requires a live-backed first transit departure", () => {
  // A later live subway departure must never lend leave guidance to a first
  // transit that itself ran on fallback data. 40-minute subway countdown:
  // departs 08:30, readiness 08:22, so the later step is genuinely live.
  const laterLiveSubway = [subwayArrival({ seconds: 2400 })];
  const prefixSteps = [
    walk("walk-out", 4),
    busStep(7),
    walk("walk-transfer", 3),
    subwayStep(6),
    walk("walk-dest", 2),
  ] as const;

  it("emits no leaveBy when the first transit is unavailable on fallback and a later subway is live", () => {
    const result = estimate(prefixSteps, {
      subway: [subwaySource({ arrivals: laterLiveSubway })],
    });

    expect(result.leaveBy).toBeNull();
    expect(result.steps[1]?.basis).toBe("unavailable");
    expect(result.steps[1]?.departureAt).toBe(at(8, 1));
    expect(result.steps[3]?.basis).toBe("live");
    expect(result.steps[3]?.matchedCandidate).toBe("1002-하행-강남방면");
    expect(result.steps[3]?.departureAt).toBe(at(8, 30));
    expect(result.arrivalAt).toBe(at(8, 54));
  });

  it("emits no leaveBy when the first transit is stale on fallback and a later subway is live", () => {
    const result = estimate(prefixSteps, {
      bus: [busSource({ successAt: NOW - 91_000 })],
      subway: [subwaySource({ arrivals: laterLiveSubway })],
    });

    expect(result.leaveBy).toBeNull();
    expect(result.steps[1]?.basis).toBe("stale");
    expect(result.steps[1]?.departureAt).toBe(at(8, 1));
    expect(result.steps[3]?.basis).toBe("live");
    expect(result.steps[3]?.departureAt).toBe(at(8, 30));
    expect(result.arrivalAt).toBe(at(8, 54));
  });
});
