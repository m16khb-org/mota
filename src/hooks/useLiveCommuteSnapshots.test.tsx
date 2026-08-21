// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ArsId, StopId } from "../domain/bus";
import type {
  BusLiveQuery,
  LiveQuery,
  LiveSnapshot,
  SubwayLiveQuery,
} from "../domain/liveCommuteQueries";
import { snapshotBasis } from "../domain/liveCommuteQueries";
import type { SubwayStation } from "../domain/subway";
import {
  LIVE_REFRESH_INTERVAL_MS,
  useLiveCommuteSnapshots,
} from "./useLiveCommuteSnapshots";

const busQuery: BusLiveQuery = {
  kind: "bus",
  key: "bus:25014",
  args: { arsId: "25014" as ArsId },
  stopIds: ["124000454" as StopId],
};

const otherBusQuery: BusLiveQuery = {
  kind: "bus",
  key: "bus:25273",
  args: { arsId: "25273" as ArsId },
  stopIds: ["124000120" as StopId],
};

const subwayQuery: SubwayLiveQuery = {
  kind: "subway",
  key: "subway:총신대입구(이수)",
  args: { station: "총신대입구(이수)" },
  stationIds: ["osm-node-2095165702" as SubwayStation["id"]],
};

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

/** Fake-clock epoch; SUCCESS_AT is 60s earlier so a success stays `live`. */
const FAKE_NOW = Date.parse("2026-08-20T03:12:00.000Z");
const SUCCESS_AT = "2026-08-20T03:11:00.000Z";
const SUCCESS_AT_MS = Date.parse(SUCCESS_AT);
const SECOND_SUCCESS_AT = "2026-08-20T03:12:25.000Z";
const SECOND_SUCCESS_AT_MS = Date.parse(SECOND_SUCCESS_AT);

const busSuccessPayload = (updatedAt = SUCCESS_AT) => ({
  arrivals: [busArrivalRow],
  updatedAt,
});

const subwaySuccessPayload = {
  arrivals: [subwayArrivalRow],
  updatedAt: SUCCESS_AT,
};

const upstreamFailurePayload = { error: "UPSTREAM_UNAVAILABLE" };

interface Deferred<T> {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
  readonly reject: (error: unknown) => void;
}

function createDeferred<T>(): Deferred<T> {
  let resolve: (value: T) => void = () => {};
  let reject: (error: unknown) => void = () => {};
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** URL-routed fetch stub: each fetch must have a pre-queued deferred response. */
class ControlledApi {
  private readonly deferreds = new Map<string, Array<Deferred<Response>>>();
  readonly calls: string[] = [];

  expect(urlPart: string): Deferred<Response> {
    const queue = this.deferreds.get(urlPart) ?? [];
    const deferred = createDeferred<Response>();
    queue.push(deferred);
    this.deferreds.set(urlPart, queue);
    return deferred;
  }

  install(): void {
    vi.stubGlobal(
      "fetch",
      (input: unknown): Promise<Response> => {
        const url = String(input);
        this.calls.push(url);
        for (const [urlPart, queue] of this.deferreds) {
          if (!url.includes(urlPart)) continue;
          const deferred = queue.shift();
          if (deferred !== undefined) return deferred.promise;
        }
        throw new Error(`unexpected fetch: ${url}`);
      },
    );
  }

  count(urlPart: string): number {
    return this.calls.filter((url) => url.includes(urlPart)).length;
  }
}

type HookRender = {
  readonly current: {
    readonly snapshots: ReadonlyMap<string, LiveSnapshot>;
    readonly refresh: () => void;
  };
};

function snapshotOf(render: HookRender, key: string): LiveSnapshot {
  const snapshot = render.current.snapshots.get(key);
  if (!snapshot) throw new Error(`missing snapshot for ${key}`);
  return snapshot;
}

/** Real `visibilitychange` event through a controlled visibilityState. */
function setVisibility(state: DocumentVisibilityState): void {
  Object.defineProperty(document, "visibilityState", {
    value: state,
    configurable: true,
  });
  act(() => {
    document.dispatchEvent(new Event("visibilitychange"));
  });
}

function restoreVisibility(): void {
  Reflect.deleteProperty(document, "visibilityState");
}

describe("useLiveCommuteSnapshots", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: FAKE_NOW });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    restoreVisibility();
  });

  it("loads immediately: pending on mount, success once the endpoint resolves", async () => {
    const api = new ControlledApi();
    const first = api.expect("/api/arrivals/25014");
    api.install();

    const { result } = renderHook(() =>
      useLiveCommuteSnapshots([busQuery]),
    );

    const pending = snapshotOf(result, busQuery.key);
    expect(pending.latestAttemptStatus).toBe("pending");
    expect(pending.latestAttemptAt).toBe(FAKE_NOW);
    expect(pending.lastSuccess).toBeNull();
    expect(pending.error).toBeNull();
    expect(api.count("/api/arrivals/25014")).toBe(1);

    await act(async () => {
      first.resolve(Response.json(busSuccessPayload()));
    });

    const success = snapshotOf(result, busQuery.key);
    expect(success.latestAttemptStatus).toBe("success");
    expect(success.latestAttemptAt).toBe(FAKE_NOW);
    expect(success.lastSuccess?.updatedAt).toBe(SUCCESS_AT_MS);
    expect(success.error).toBeNull();
    expect(snapshotBasis(success, Date.now())).toBe("live");
    expect(api.count("/api/arrivals/25014")).toBe(1);
  });

  it("issues no request for an empty query set", () => {
    const api = new ControlledApi();
    api.install();

    const { result } = renderHook(() => useLiveCommuteSnapshots([]));

    expect(result.current.snapshots.size).toBe(0);
    expect(api.calls).toEqual([]);
    act(() => {
      vi.advanceTimersByTime(LIVE_REFRESH_INTERVAL_MS * 2);
    });
    expect(api.calls).toEqual([]);
  });

  it("refreshes exactly once per 30-second interval while visible", async () => {
    const api = new ControlledApi();
    const first = api.expect("/api/arrivals/25014");
    const second = api.expect("/api/arrivals/25014");
    api.install();
    const { result } = renderHook(() => useLiveCommuteSnapshots([busQuery]));
    await act(async () => {
      first.resolve(Response.json(busSuccessPayload()));
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(LIVE_REFRESH_INTERVAL_MS - 1);
    });
    expect(api.count("/api/arrivals/25014")).toBe(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(api.count("/api/arrivals/25014")).toBe(2);
    expect(snapshotOf(result, busQuery.key).latestAttemptStatus).toBe(
      "pending",
    );

    await act(async () => {
      second.resolve(Response.json(busSuccessPayload(SECOND_SUCCESS_AT)));
    });
    const refreshed = snapshotOf(result, busQuery.key);
    expect(refreshed.latestAttemptStatus).toBe("success");
    expect(refreshed.lastSuccess?.updatedAt).toBe(SECOND_SUCCESS_AT_MS);
    expect(snapshotBasis(refreshed, Date.now())).toBe("live");
  });

  it("skips interval ticks while a refresh generation is in flight", async () => {
    const api = new ControlledApi();
    const first = api.expect("/api/arrivals/25014");
    api.install();
    const { result } = renderHook(() => useLiveCommuteSnapshots([busQuery]));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(LIVE_REFRESH_INTERVAL_MS * 3);
    });
    expect(api.count("/api/arrivals/25014")).toBe(1);
    expect(snapshotOf(result, busQuery.key).latestAttemptStatus).toBe(
      "pending",
    );

    await act(async () => {
      first.resolve(Response.json(busSuccessPayload()));
    });
    expect(snapshotOf(result, busQuery.key).latestAttemptStatus).toBe(
      "success",
    );

    const second = api.expect("/api/arrivals/25014");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(LIVE_REFRESH_INTERVAL_MS);
    });
    expect(api.count("/api/arrivals/25014")).toBe(2);
    await act(async () => {
      second.resolve(Response.json(busSuccessPayload(SECOND_SUCCESS_AT)));
    });
    expect(snapshotOf(result, busQuery.key).latestAttemptStatus).toBe(
      "success",
    );
  });

  it("aborts the in-flight attempt and pauses scheduling when hidden", async () => {
    const api = new ControlledApi();
    const first = api.expect("/api/arrivals/25014");
    api.install();
    const { result } = renderHook(() => useLiveCommuteSnapshots([busQuery]));

    setVisibility("hidden");
    const aborted = snapshotOf(result, busQuery.key);
    expect(aborted.latestAttemptStatus).toBe("idle");
    expect(aborted.lastSuccess).toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(LIVE_REFRESH_INTERVAL_MS * 4);
    });
    expect(api.count("/api/arrivals/25014")).toBe(1);

    await act(async () => {
      first.resolve(Response.json(busSuccessPayload()));
    });
    expect(snapshotOf(result, busQuery.key).latestAttemptStatus).toBe("idle");

    await act(async () => {
      window.dispatchEvent(new Event("online"));
    });
    expect(api.count("/api/arrivals/25014")).toBe(1);
  });

  it("refreshes immediately when the document becomes visible again", async () => {
    const api = new ControlledApi();
    const first = api.expect("/api/arrivals/25014");
    api.install();
    const { result } = renderHook(() => useLiveCommuteSnapshots([busQuery]));
    await act(async () => {
      first.resolve(Response.json(busSuccessPayload()));
    });

    setVisibility("hidden");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(api.count("/api/arrivals/25014")).toBe(1);

    const second = api.expect("/api/arrivals/25014");
    setVisibility("visible");
    expect(api.count("/api/arrivals/25014")).toBe(2);
    expect(snapshotOf(result, busQuery.key).latestAttemptStatus).toBe(
      "pending",
    );
    await act(async () => {
      second.resolve(Response.json(busSuccessPayload(SECOND_SUCCESS_AT)));
    });
    const refreshed = snapshotOf(result, busQuery.key);
    expect(refreshed.latestAttemptStatus).toBe("success");
    expect(refreshed.lastSuccess?.updatedAt).toBe(SECOND_SUCCESS_AT_MS);

    const third = api.expect("/api/arrivals/25014");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(LIVE_REFRESH_INTERVAL_MS);
    });
    expect(api.count("/api/arrivals/25014")).toBe(3);
    await act(async () => {
      third.resolve(Response.json(busSuccessPayload()));
    });
    expect(snapshotOf(result, busQuery.key).latestAttemptStatus).toBe(
      "success",
    );
  });

  it("refreshes immediately on the online event while visible", async () => {
    const api = new ControlledApi();
    const first = api.expect("/api/arrivals/25014");
    api.install();
    const { result } = renderHook(() => useLiveCommuteSnapshots([busQuery]));
    await act(async () => {
      first.resolve(Response.json(busSuccessPayload()));
    });

    const second = api.expect("/api/arrivals/25014");
    await act(async () => {
      window.dispatchEvent(new Event("online"));
    });
    expect(api.count("/api/arrivals/25014")).toBe(2);
    expect(snapshotOf(result, busQuery.key).latestAttemptStatus).toBe(
      "pending",
    );
    await act(async () => {
      second.resolve(Response.json(busSuccessPayload(SECOND_SUCCESS_AT)));
    });
    expect(snapshotOf(result, busQuery.key).latestAttemptStatus).toBe(
      "success",
    );
  });

  it("manual refresh starts one generation and busy triggers are ignored", async () => {
    const api = new ControlledApi();
    const first = api.expect("/api/arrivals/25014");
    api.install();
    const { result } = renderHook(() => useLiveCommuteSnapshots([busQuery]));

    act(() => {
      result.current.refresh();
      result.current.refresh();
    });
    expect(api.count("/api/arrivals/25014")).toBe(1);
    await act(async () => {
      first.resolve(Response.json(busSuccessPayload()));
    });
    expect(snapshotOf(result, busQuery.key).latestAttemptStatus).toBe(
      "success",
    );

    const second = api.expect("/api/arrivals/25014");
    act(() => {
      result.current.refresh();
    });
    expect(api.count("/api/arrivals/25014")).toBe(2);
    expect(snapshotOf(result, busQuery.key).latestAttemptStatus).toBe(
      "pending",
    );
    await act(async () => {
      second.resolve(Response.json(busSuccessPayload(SECOND_SUCCESS_AT)));
    });
    expect(
      snapshotOf(result, busQuery.key).lastSuccess?.updatedAt,
    ).toBe(SECOND_SUCCESS_AT_MS);
  });

  it("discards an obsolete generation after query inputs change", async () => {
    const api = new ControlledApi();
    const obsolete = api.expect("/api/arrivals/25014");
    api.install();
    const { result, rerender } = renderHook(
      ({ queries }: { queries: readonly BusLiveQuery[] }) =>
        useLiveCommuteSnapshots(queries),
      { initialProps: { queries: [busQuery] as readonly BusLiveQuery[] } },
    );

    const replacement = api.expect("/api/arrivals/25273");
    rerender({ queries: [otherBusQuery] });
    expect(api.count("/api/arrivals/25273")).toBe(1);
    expect(api.count("/api/arrivals/25014")).toBe(1);
    expect(result.current.snapshots.has(busQuery.key)).toBe(false);
    expect(snapshotOf(result, otherBusQuery.key).latestAttemptStatus).toBe(
      "pending",
    );

    await act(async () => {
      obsolete.resolve(Response.json(busSuccessPayload()));
    });
    expect(result.current.snapshots.has(busQuery.key)).toBe(false);
    expect(snapshotOf(result, otherBusQuery.key).latestAttemptStatus).toBe(
      "pending",
    );

    await act(async () => {
      replacement.resolve(Response.json(busSuccessPayload(SECOND_SUCCESS_AT)));
    });
    const replacementSnapshot = snapshotOf(result, otherBusQuery.key);
    expect(replacementSnapshot.latestAttemptStatus).toBe("success");
    expect(replacementSnapshot.lastSuccess?.updatedAt).toBe(
      SECOND_SUCCESS_AT_MS,
    );
    expect(api.count("/api/arrivals/25014")).toBe(1);
  });

  it("drops snapshots for removed queries while retaining the rest", async () => {
    const api = new ControlledApi();
    const busFirst = api.expect("/api/arrivals/25014");
    const subwayFirst = api.expect("subway/arrivals");
    api.install();
    const { result, rerender } = renderHook(
      ({ queries }: { queries: readonly LiveQuery[] }) =>
        useLiveCommuteSnapshots(queries),
      { initialProps: { queries: [busQuery, subwayQuery] } },
    );
    await act(async () => {
      busFirst.resolve(Response.json(busSuccessPayload()));
      subwayFirst.resolve(Response.json(subwaySuccessPayload));
    });
    expect(snapshotOf(result, subwayQuery.key).latestAttemptStatus).toBe(
      "success",
    );

    const subwaySecond = api.expect("subway/arrivals");
    rerender({ queries: [subwayQuery] });
    expect(result.current.snapshots.has(busQuery.key)).toBe(false);
    expect(snapshotOf(result, subwayQuery.key).latestAttemptStatus).toBe(
      "pending",
    );

    await act(async () => {
      subwaySecond.resolve(Response.json(subwaySuccessPayload));
    });
    const retained = snapshotOf(result, subwayQuery.key);
    expect(retained.latestAttemptStatus).toBe("success");
    expect(retained.lastSuccess?.updatedAt).toBe(SUCCESS_AT_MS);
    expect(api.count("/api/arrivals/25014")).toBe(1);
    expect(api.count("subway/arrivals")).toBe(2);
  });

  it("keeps the last success when a later attempt fails", async () => {
    const api = new ControlledApi();
    const first = api.expect("/api/arrivals/25014");
    api.install();
    const { result } = renderHook(() => useLiveCommuteSnapshots([busQuery]));
    await act(async () => {
      first.resolve(Response.json(busSuccessPayload()));
    });
    expect(snapshotBasis(snapshotOf(result, busQuery.key), Date.now())).toBe(
      "live",
    );

    const failing = api.expect("/api/arrivals/25014");
    const failedAt = FAKE_NOW + 25_000;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(25_000);
      result.current.refresh();
    });
    expect(snapshotOf(result, busQuery.key).latestAttemptStatus).toBe(
      "pending",
    );

    await act(async () => {
      failing.resolve(Response.json(upstreamFailurePayload, { status: 502 }));
    });
    const failed = snapshotOf(result, busQuery.key);
    expect(failed.latestAttemptStatus).toBe("failure");
    expect(failed.latestAttemptAt).toBe(failedAt);
    expect(failed.error).toContain("502");
    expect(failed.error).toContain("UPSTREAM_UNAVAILABLE");
    expect(failed.lastSuccess?.updatedAt).toBe(SUCCESS_AT_MS);
    expect(failed.lastSuccess?.arrivals.length).toBe(1);
    expect(snapshotBasis(failed, Date.now())).toBe("stale");
  });

  it("derives idle snapshots when mounted hidden and loads on first visibility", async () => {
    const api = new ControlledApi();
    api.install();
    setVisibility("hidden");
    const { result } = renderHook(() => useLiveCommuteSnapshots([busQuery]));

    const idle = snapshotOf(result, busQuery.key);
    expect(idle.latestAttemptStatus).toBe("idle");
    expect(idle.latestAttemptAt).toBe(0);
    expect(idle.lastSuccess).toBeNull();
    expect(idle.error).toBeNull();
    expect(api.calls).toEqual([]);

    const first = api.expect("/api/arrivals/25014");
    setVisibility("visible");
    expect(api.count("/api/arrivals/25014")).toBe(1);
    expect(snapshotOf(result, busQuery.key).latestAttemptStatus).toBe(
      "pending",
    );
    await act(async () => {
      first.resolve(Response.json(busSuccessPayload()));
    });
    const success = snapshotOf(result, busQuery.key);
    expect(success.latestAttemptStatus).toBe("success");
    expect(success.lastSuccess?.updatedAt).toBe(SUCCESS_AT_MS);
  });

  it("rapid manual, online, and visibility triggers never overlap generations", async () => {
    const api = new ControlledApi();
    const first = api.expect("/api/arrivals/25014");
    api.install();
    const { result } = renderHook(() => useLiveCommuteSnapshots([busQuery]));

    act(() => {
      result.current.refresh();
      window.dispatchEvent(new Event("online"));
      result.current.refresh();
    });
    expect(api.count("/api/arrivals/25014")).toBe(1);

    await act(async () => {
      first.resolve(Response.json(busSuccessPayload()));
    });
    expect(snapshotOf(result, busQuery.key).latestAttemptStatus).toBe(
      "success",
    );

    const second = api.expect("/api/arrivals/25014");
    act(() => {
      result.current.refresh();
      window.dispatchEvent(new Event("online"));
      result.current.refresh();
    });
    expect(api.count("/api/arrivals/25014")).toBe(2);

    setVisibility("hidden");
    const reverted = snapshotOf(result, busQuery.key);
    expect(reverted.latestAttemptStatus).toBe("success");
    expect(reverted.lastSuccess?.updatedAt).toBe(SUCCESS_AT_MS);

    await act(async () => {
      second.resolve(Response.json(busSuccessPayload(SECOND_SUCCESS_AT)));
    });
    const stillReverted = snapshotOf(result, busQuery.key);
    expect(stillReverted.latestAttemptStatus).toBe("success");
    expect(stillReverted.lastSuccess?.updatedAt).toBe(SUCCESS_AT_MS);

    const third = api.expect("/api/arrivals/25014");
    setVisibility("visible");
    expect(api.count("/api/arrivals/25014")).toBe(3);
    await act(async () => {
      window.dispatchEvent(new Event("online"));
    });
    expect(api.count("/api/arrivals/25014")).toBe(3);
    await act(async () => {
      third.resolve(Response.json(busSuccessPayload(SECOND_SUCCESS_AT)));
    });
    const resumed = snapshotOf(result, busQuery.key);
    expect(resumed.latestAttemptStatus).toBe("success");
    expect(resumed.lastSuccess?.updatedAt).toBe(SECOND_SUCCESS_AT_MS);
  });

  it("stops refreshing after unmount: no timers, listeners, or fetches remain", async () => {
    const api = new ControlledApi();
    const first = api.expect("/api/arrivals/25014");
    api.install();
    const { result, unmount } = renderHook(() =>
      useLiveCommuteSnapshots([busQuery]),
    );

    unmount();
    await act(async () => {
      first.resolve(Response.json(busSuccessPayload()));
      await vi.advanceTimersByTimeAsync(120_000);
      window.dispatchEvent(new Event("online"));
      Object.defineProperty(document, "visibilityState", {
        value: "visible",
        configurable: true,
      });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(api.count("/api/arrivals/25014")).toBe(1);
    expect(result.current.snapshots.size).toBe(1);
  });
});
