import { describe, expect, it } from "vitest";
import type { BusArrival } from "./bus";
import { rankRouteWaits } from "./routeComparison";

const arrival = (routeName: string, seconds: number | null): BusArrival => ({
  routeId: `route-${routeName}` as BusArrival["routeId"],
  routeName,
  direction: "강동공영차고지",
  routeType: "3",
  lowFloor: false,
  first: {
    message: seconds === null ? "운행 종료" : `${seconds}초 후`,
    seconds,
    remainingStops: null,
    congestion: null,
  },
  second: null,
});

describe("rankRouteWaits", () => {
  it("ranks only fresh numeric boarding waits with dense ties", () => {
    const ranked = rankRouteWaits([
      { id: "slow", arrivals: [arrival("3411", 300)], fresh: true },
      { id: "fast-a", arrivals: [arrival("강동05", 120)], fresh: true },
      { id: "fast-b", arrivals: [arrival("3324", 120)], fresh: true },
      { id: "unknown", arrivals: [arrival("N30", null)], fresh: true },
      { id: "stale", arrivals: [arrival("3214", 30)], fresh: false },
    ]);

    expect(ranked).toEqual([
      {
        id: "slow",
        fresh: true,
        failed: false,
        seconds: 300,
        rank: 2,
        routeName: "3411",
      },
      {
        id: "fast-a",
        fresh: true,
        failed: false,
        seconds: 120,
        rank: 1,
        routeName: "강동05",
      },
      {
        id: "fast-b",
        fresh: true,
        failed: false,
        seconds: 120,
        rank: 1,
        routeName: "3324",
      },
      {
        id: "unknown",
        fresh: true,
        failed: false,
        seconds: null,
        rank: null,
        routeName: null,
      },
      {
        id: "stale",
        fresh: false,
        failed: false,
        seconds: null,
        rank: null,
        routeName: null,
      },
    ]);
  });
});
