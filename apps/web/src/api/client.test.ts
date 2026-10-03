import { afterEach, describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";
import { arrivalLookupSchema } from "../domain/bus";
import { ApiError, fetchArrivals, fetchNearbyStops, isServiceAreaError } from "./client";

describe("nearby request cancellation", () => {
  const busStop = {
    id: "100000001",
    arsId: "01001",
    name: "시청앞",
    lat: 37.5663,
    lng: 126.9779,
    distanceMeters: 120,
  };

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it.each([
    {
      name: "bus stop",
      request: (signal: AbortSignal) =>
        fetchNearbyStops({ lat: 37.5663, lng: 126.9779 }, 800, signal),
      expectedUrl: "/api/stops/nearby?lat=37.566300&lng=126.977900&radius=800",
    },
  ])(
    "rejects an in-flight $name search when the caller aborts",
    async ({ request, expectedUrl }) => {
      let requestSignal: AbortSignal | undefined;
      const fetchMock = vi.fn(
        (_url: string | URL | Request, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            requestSignal = init?.signal ?? undefined;
            requestSignal?.addEventListener("abort", () => reject(requestSignal?.reason), {
              once: true,
            });
          }),
      );
      vi.stubGlobal("fetch", fetchMock);
      const controller = new AbortController();

      const pendingRequest = request(controller.signal);
      controller.abort();
      const error: unknown = await pendingRequest.then(
        () => null,
        (reason: unknown) => reason,
      );

      expect(error).toBeInstanceOf(DOMException);
      expect(error).toMatchObject({ name: "AbortError" });
      expect(fetchMock).toHaveBeenCalledWith(expectedUrl, {
        signal: requestSignal,
      });
      expect(requestSignal).not.toBe(controller.signal);
      expect(requestSignal?.aborted).toBe(true);
    },
  );

  it("keeps the timeout capable of cancelling a request with a caller signal", async () => {
    const timeoutController = new AbortController();
    vi.spyOn(AbortSignal, "timeout").mockReturnValue(timeoutController.signal);
    let requestSignal: AbortSignal | undefined;
    const fetchMock = vi.fn(
      (_url: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          requestSignal = init?.signal ?? undefined;
          requestSignal?.addEventListener("abort", () => reject(requestSignal?.reason), {
            once: true,
          });
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const callerController = new AbortController();

    const pendingRequest = fetchNearbyStops(
      { lat: 37.5663, lng: 126.9779 },
      800,
      callerController.signal,
    );
    const timeoutError = new DOMException("The operation timed out", "TimeoutError");
    timeoutController.abort(timeoutError);
    const error: unknown = await pendingRequest.then(
      () => null,
      (reason: unknown) => reason,
    );

    expect(error).toBe(timeoutError);
    expect(requestSignal?.aborted).toBe(true);
    expect(callerController.signal.aborted).toBe(false);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/stops/nearby?lat=37.566300&lng=126.977900&radius=800",
      { signal: requestSignal },
    );
  });

  it.each([
    {
      name: "default bus radius",
      request: () => fetchNearbyStops({ lat: 37.5663, lng: 126.9779 }),
      payload: { stops: [busStop] },
      expectedResult: busStop,
      expectedTimeout: 8_000,
      expectedUrl: "/api/stops/nearby?lat=37.566300&lng=126.977900&radius=800",
    },
    {
      name: "custom bus radius",
      request: () => fetchNearbyStops({ lat: 37.5663, lng: 126.9779 }, 1_250),
      payload: { stops: [busStop] },
      expectedResult: busStop,
      expectedTimeout: 8_000,
      expectedUrl: "/api/stops/nearby?lat=37.566300&lng=126.977900&radius=1250",
    },
  ])(
    "keeps $name serialization without a caller signal",
    async ({ request, payload, expectedResult, expectedTimeout, expectedUrl }) => {
      const timeoutController = new AbortController();
      const timeoutSpy = vi.spyOn(AbortSignal, "timeout").mockReturnValue(timeoutController.signal);
      const fetchMock = vi.fn().mockResolvedValue(Response.json(payload));
      vi.stubGlobal("fetch", fetchMock);

      const result = await request();

      expect(result).toEqual([expectedResult]);
      expect(timeoutSpy).toHaveBeenCalledWith(expectedTimeout);
      expect(fetchMock).toHaveBeenCalledWith(expectedUrl, {
        signal: timeoutController.signal,
      });
    },
  );

  it("preserves a non-abort transport failure when a caller signal exists", async () => {
    const transportError = new TypeError("network down");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(transportError));
    const controller = new AbortController();

    const error: unknown = await fetchNearbyStops(
      { lat: 37.5366, lng: 127.1253 },
      800,
      controller.signal,
    ).then(
      () => null,
      (reason: unknown) => reason,
    );

    expect(error).toBe(transportError);
    expect(controller.signal.aborted).toBe(false);
  });

  it("preserves a non-abort API failure when a caller signal exists", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json({ error: "INVALID_LOCATION" }, { status: 400 })),
    );
    const controller = new AbortController();

    const error: unknown = await fetchNearbyStops(
      { lat: 37.2636, lng: 127.0286 },
      800,
      controller.signal,
    ).then(
      () => null,
      (reason: unknown) => reason,
    );

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 400, code: "INVALID_LOCATION" });
    expect(controller.signal.aborted).toBe(false);
  });
});

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
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 503 })));

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

describe("fetchArrivals baseline", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

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
  const arsId = arrivalLookupSchema.parse({ arsId: "25014" }).arsId;

  it("baseline: parses bus arrivals through the browser Zod boundary unchanged", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(busArrivalsPayload)));

    const result = await fetchArrivals(arsId);

    expect(result.arrivals[0]?.routeId).toBe("100100574");
    expect(result.arrivals[0]?.routeName).toBe("341");
    expect(result.arrivals[0]?.direction).toBe("강동공영차고지");
    expect(result.arrivals[0]?.first.seconds).toBe(310);
    expect(result.arrivals[0]?.second?.seconds).toBe(660);
    expect(result.updatedAt).toBe("2026-08-20T03:10:20.000Z");
  });

  it("baseline: maps non-OK arrival responses to ApiError with the upstream code", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json({ error: "UPSTREAM_UNAVAILABLE" }, { status: 502 })),
    );

    const error: unknown = await fetchArrivals(arsId).then(
      () => null,
      (reason: unknown) => reason,
    );

    expect(error).toBeInstanceOf(ApiError);
    expect(error instanceof ApiError && error.status).toBe(502);
    expect(error instanceof ApiError && error.code).toBe("UPSTREAM_UNAVAILABLE");
  });

  it("baseline: rejects with the raw transport error when fetch itself fails", async () => {
    const transportError = new TypeError("network down");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(transportError));

    const error: unknown = await fetchArrivals(arsId).then(
      () => null,
      (reason: unknown) => reason,
    );

    expect(error).toBe(transportError);
    expect(error).not.toBeInstanceOf(ApiError);
  });

  it("baseline: rejects malformed arrival payloads at the browser boundary", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          arrivals: [
            {
              ...busArrivalRow,
              first: {
                message: "5분 10초후",
                seconds: "310",
                remainingStops: 6,
                congestion: null,
              },
            },
          ],
          updatedAt: "2026-08-20T03:10:20.000Z",
        }),
      ),
    );

    const error: unknown = await fetchArrivals(arsId).then(
      () => null,
      (reason: unknown) => reason,
    );

    expect(error).toBeInstanceOf(ZodError);
  });
});
