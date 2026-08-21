import { afterEach, describe, expect, it, vi, type Mock } from "vitest";
import { liveArrivalsPort } from "../api/client";
import {
  commuteFavoriteSchema,
  commuteProcedureSchema,
  type CommuteFavorite,
  type SavedCommuteProcedure,
} from "./commute";
import {
  LIVE_FRESHNESS_MS,
  deriveLiveQueries,
  refreshLiveQueries,
  snapshotBasis,
  type LiveSnapshot,
} from "./liveCommuteQueries";

const busStopId = "124000454";
const otherBusStopId = "124000555";
const arsId = "25014";
const apiStationName = "총신대입구(이수)";
const procedureStationId = "osm-node-2095165702";
const favoriteStationAId = "osm-node-4491234";
const favoriteStationBId = "osm-node-4495678";

const activeProcedure: SavedCommuteProcedure = commuteProcedureSchema.parse({
  id: "proc-1",
  kind: "ready",
  name: "아침 출근",
  steps: [
    { id: "step-walk-1", kind: "walk", minutes: 5 },
    {
      id: "step-bus",
      kind: "bus",
      stopId: busStopId,
      arsId,
      routeId: "100100574",
      routeName: "341",
      direction: "강동공영차고지",
      rideMinutes: 18,
      fallbackWaitMinutes: 7,
    },
    { id: "step-walk-2", kind: "walk", minutes: 3 },
    {
      id: "step-subway",
      kind: "subway",
      stationId: procedureStationId,
      apiStationName,
      subwayId: "1002",
      updnLine: "하행",
      lineName: "2호선",
      trainLineNm: "강남방면",
      rideMinutes: 22,
      fallbackWaitMinutes: 6,
    },
    { id: "step-walk-3", kind: "walk", minutes: 4 },
  ],
});

function busFavorite(id: string, stopId: string): CommuteFavorite {
  return commuteFavoriteSchema.parse({
    id,
    kind: "bus",
    stopId,
    arsId,
    routeId: "100100574",
    routeName: "341",
    direction: "강동공영차고지",
    accessMinutes: 6,
  });
}

function subwayFavorite(
  id: string,
  stationId: string,
  apiName = apiStationName,
): CommuteFavorite {
  return commuteFavoriteSchema.parse({
    id,
    kind: "subway",
    stationId,
    apiStationName: apiName,
    subwayId: "1002",
    updnLine: "하행",
    lineName: "2호선",
    trainLineNm: "강남방면",
    accessMinutes: 8,
  });
}

const updatedAtMs = Date.parse("2026-08-20T03:10:20.000Z");
const now = Date.parse("2026-08-20T03:12:00.000Z");

const busArrivalRow = {
  routeId: "100100574",
  routeName: "341",
  direction: "강동공영차고지",
  routeType: "3",
  lowFloor: true,
  first: {
    message: "5분 10초후",
    seconds: 310,
    remainingStops: 6,
    congestion: "보통",
  },
  second: {
    message: "11분후",
    seconds: 660,
    remainingStops: 14,
    congestion: null,
  },
};
const busArrivalsPayload = {
  arrivals: [busArrivalRow],
  updatedAt: "2026-08-20T03:10:20.000Z",
};

const subwayArrivalRow = {
  id: "1002-하행-강남방면",
  subwayId: "1002",
  updnLine: "하행",
  line: "2호선",
  direction: "강남방면",
  trainLineNm: "강남방면",
  trainStatus: "일반",
  seconds: 45,
  message: "전역 출발",
  location: "을지로",
  isLastTrain: false,
};
const subwayArrivalsPayload = {
  arrivals: [subwayArrivalRow],
  updatedAt: "2026-08-20T03:10:20.000Z",
};

function stubApi(handler: (url: string) => Response): Mock {
  const fetchMock = vi.fn(async (input: unknown) => handler(String(input)));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function callCount(fetchMock: Mock, urlPart: string): number {
  return fetchMock.mock.calls.filter((call) =>
    String(call[0]).includes(urlPart),
  ).length;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("deriveLiveQueries", () => {
  it("merges duplicate procedure and favorite bus locations into one request per endpoint", () => {
    const queries = deriveLiveQueries({
      activeProcedure,
      visibleFavorites: [
        busFavorite("fav-bus-1", busStopId),
        busFavorite("fav-bus-2", otherBusStopId),
      ],
    });

    expect(queries).toEqual([
      {
        kind: "bus",
        key: `bus:${arsId}`,
        args: { arsId },
        stopIds: [busStopId, otherBusStopId],
      },
      {
        kind: "subway",
        key: `subway:${apiStationName}`,
        args: { station: apiStationName },
        stationIds: [procedureStationId],
      },
    ]);
  });

  it("retains both consuming station IDs when favorites share one API station name", () => {
    const queries = deriveLiveQueries({
      activeProcedure: null,
      visibleFavorites: [
        subwayFavorite("fav-subway-1", favoriteStationAId),
        subwayFavorite("fav-subway-2", favoriteStationBId),
      ],
    });

    expect(queries).toEqual([
      {
        kind: "subway",
        key: `subway:${apiStationName}`,
        args: { station: apiStationName },
        stationIds: [favoriteStationAId, favoriteStationBId],
      },
    ]);
  });

  it("keeps bus and subway dedupe keys distinct even when their text matches", () => {
    const queries = deriveLiveQueries({
      activeProcedure: null,
      visibleFavorites: [
        busFavorite("fav-bus-1", busStopId),
        subwayFavorite("fav-subway-1", favoriteStationAId, "25014"),
      ],
    });

    const keys = queries.map((query) => query.key);
    expect(keys).toEqual(["bus:25014", "subway:25014"]);
    expect(new Set(keys).size).toBe(2);
  });

  it("derives no request when no procedure is active", () => {
    expect(
      deriveLiveQueries({ activeProcedure: null, visibleFavorites: [] }),
    ).toEqual([]);
  });
});

describe("refreshLiveQueries", () => {
  it("fetches each endpoint exactly once for duplicated consumers", async () => {
    const queries = deriveLiveQueries({
      activeProcedure,
      visibleFavorites: [
        busFavorite("fav-bus-1", busStopId),
        busFavorite("fav-bus-2", otherBusStopId),
        subwayFavorite("fav-subway-1", procedureStationId),
      ],
    });
    const fetchMock = stubApi((url) =>
      url.includes("/api/arrivals/")
        ? Response.json(busArrivalsPayload)
        : Response.json(subwayArrivalsPayload),
    );

    const snapshots = await refreshLiveQueries(queries, { port: liveArrivalsPort, now });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(callCount(fetchMock, "/api/arrivals/")).toBe(1);
    expect(callCount(fetchMock, "/api/subway/arrivals")).toBe(1);
    expect(snapshots.size).toBe(2);

    const bus = snapshots.get(`bus:${arsId}`);
    if (!bus) throw new Error("expected a bus snapshot");
    expect(bus.latestAttemptStatus).toBe("success");
    expect(bus.latestAttemptAt).toBe(now);
    expect(bus.error).toBeNull();
    expect(bus.lastSuccess?.updatedAt).toBe(updatedAtMs);
    const busRow = bus.lastSuccess?.arrivals[0];
    if (!busRow || !("routeId" in busRow)) {
      throw new Error("expected a parsed bus arrival row");
    }
    expect(busRow.routeId).toBe("100100574");

    const subway = snapshots.get(`subway:${apiStationName}`);
    if (!subway) throw new Error("expected a subway snapshot");
    expect(subway.latestAttemptStatus).toBe("success");
    const subwayRow = subway.lastSuccess?.arrivals[0];
    if (!subwayRow || !("subwayId" in subwayRow)) {
      throw new Error("expected a parsed subway arrival row");
    }
    expect(subwayRow.subwayId).toBe("1002");
    expect(subwayRow.updnLine).toBe("하행");
  });

  it("keeps unrelated successes when one endpoint fails", async () => {
    const queries = deriveLiveQueries({
      activeProcedure,
      visibleFavorites: [subwayFavorite("fav-subway-1", procedureStationId)],
    });
    stubApi((url) =>
      url.includes("/api/arrivals/")
        ? Response.json(busArrivalsPayload)
        : Response.json({ error: "UPSTREAM_UNAVAILABLE" }, { status: 502 }),
    );

    const snapshots = await refreshLiveQueries(queries, { port: liveArrivalsPort, now });

    const bus = snapshots.get(`bus:${arsId}`);
    if (!bus) throw new Error("expected a bus snapshot");
    expect(bus.latestAttemptStatus).toBe("success");
    expect(bus.error).toBeNull();
    const preservedBusRow = bus.lastSuccess?.arrivals[0];
    if (!preservedBusRow || !("routeId" in preservedBusRow)) {
      throw new Error("expected the bus success to survive");
    }
    expect(preservedBusRow.routeId).toBe("100100574");

    const subway = snapshots.get(`subway:${apiStationName}`);
    if (!subway) throw new Error("expected a subway snapshot");
    expect(subway.latestAttemptStatus).toBe("failure");
    expect(subway.lastSuccess).toBeNull();
    expect(subway.error).toContain("502");
    expect(subway.error).toContain("UPSTREAM_UNAVAILABLE");
  });

  it("preserves the retained last success when a newer attempt fails", async () => {
    const [subwayQuery] = deriveLiveQueries({
      activeProcedure: null,
      visibleFavorites: [subwayFavorite("fav-subway-1", favoriteStationAId)],
    });
    if (!subwayQuery) throw new Error("expected a subway query");
    const retained: LiveSnapshot = {
      query: subwayQuery,
      latestAttemptAt: now - 30_000,
      latestAttemptStatus: "success",
      lastSuccess: { updatedAt: now - 30_000, arrivals: [] },
      error: null,
    };
    stubApi(() =>
      Response.json({ error: "UPSTREAM_UNAVAILABLE" }, { status: 502 }),
    );

    const snapshots = await refreshLiveQueries([subwayQuery], {
      port: liveArrivalsPort,
      previous: new Map([[subwayQuery.key, retained]]),
      now,
    });

    const subway = snapshots.get(subwayQuery.key);
    if (!subway) throw new Error("expected a subway snapshot");
    expect(subway.latestAttemptStatus).toBe("failure");
    expect(subway.lastSuccess).toEqual({
      updatedAt: now - 30_000,
      arrivals: [],
    });
    expect(snapshotBasis(subway, now)).toBe("stale");
  });
});

describe("snapshotBasis", () => {
  const [busQuery] = deriveLiveQueries({
    activeProcedure,
    visibleFavorites: [],
  });
  if (busQuery?.kind !== "bus") {
    throw new Error("fixture procedure must derive a bus query");
  }

  const snapshot = (overrides: Partial<LiveSnapshot> = {}): LiveSnapshot => ({
    query: busQuery,
    latestAttemptAt: now,
    latestAttemptStatus: "success",
    lastSuccess: { updatedAt: now, arrivals: [] },
    error: null,
    ...overrides,
  });

  it("reports live while the latest success is at most 90 seconds old", () => {
    expect(
      snapshotBasis(
        snapshot({
          lastSuccess: { updatedAt: now - LIVE_FRESHNESS_MS, arrivals: [] },
        }),
        now,
      ),
    ).toBe("live");
    expect(
      snapshotBasis(
        snapshot({ lastSuccess: { updatedAt: now - 60_000, arrivals: [] } }),
        now,
      ),
    ).toBe("live");
  });

  it("treats an in-flight refresh over a still-fresh success as live", () => {
    expect(
      snapshotBasis(
        snapshot({
          latestAttemptStatus: "pending",
          lastSuccess: { updatedAt: now - 60_000, arrivals: [] },
        }),
        now,
      ),
    ).toBe("live");
  });

  it("treats a success older than exactly 90 seconds as stale", () => {
    expect(
      snapshotBasis(
        snapshot({
          lastSuccess: {
            updatedAt: now - LIVE_FRESHNESS_MS - 1,
            arrivals: [],
          },
        }),
        now,
      ),
    ).toBe("stale");
  });

  it("treats a failed latest attempt with a retained success as stale", () => {
    expect(
      snapshotBasis(
        snapshot({
          latestAttemptStatus: "failure",
          error: "Request failed with 502: UPSTREAM_UNAVAILABLE",
          lastSuccess: { updatedAt: now - 5_000, arrivals: [] },
        }),
        now,
      ),
    ).toBe("stale");
  });

  it("reports unavailable whenever no success exists, regardless of status", () => {
    for (const status of ["idle", "pending", "failure"] as const) {
      expect(
        snapshotBasis(
          snapshot({
            latestAttemptStatus: status,
            lastSuccess: null,
            error: status === "failure" ? "Request failed with 502" : null,
          }),
          now,
        ),
      ).toBe("unavailable");
    }
  });
});
