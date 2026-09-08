import type { SubwayRequestBudget } from "@mota/db";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "./create-test-app";

const scopeHash = "a".repeat(64);
const responsePayload = {
  errorMessage: { code: "INFO-000", message: "정상 처리되었습니다." },
  realtimeArrivalList: [
    {
      subwayId: "1002",
      updnLine: "하행",
      trainLineNm: "강남방면",
      btrainSttus: "일반",
      barvlDt: "45",
      arvlMsg2: "전역 출발",
      arvlMsg3: "을지로",
      lstcarAt: "0",
      recptnDt: "2026-09-08 12:10:20",
    },
  ],
};

function budgetFixture(
  decision: Awaited<ReturnType<SubwayRequestBudget["reserveArrival"]>>,
) {
  return {
    reserveArrival: vi.fn().mockResolvedValue(decision),
    reservePosition: vi.fn(),
    markQuotaExhausted: vi.fn().mockResolvedValue(undefined),
  } satisfies SubwayRequestBudget;
}

describe("subway request budget call paths", () => {
  it("single-flights concurrent arrivals before reserving a second request", async () => {
    let release: ((response: Response) => void) | undefined;
    const upstream = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          release = resolve;
        }),
    );
    const budget = budgetFixture({ allowed: true, retryAt: null });
    const app = createApp(upstream, {
      subwayArrivalUpstream: "https://subway-arrival.test",
      subwayApiKeyScope: scopeHash,
      subwayRequestBudget: budget,
    });

    const first = app.request("/api/subway/arrivals?station=%EC%B2%9C%ED%98%B8");
    await vi.waitFor(() => expect(upstream).toHaveBeenCalledTimes(1));
    const second = app.request("/api/subway/arrivals?station=%EC%B2%9C%ED%98%B8");
    expect(budget.reserveArrival).toHaveBeenCalledTimes(1);

    release?.(Response.json(responsePayload));
    const responses = await Promise.all([first, second]);
    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    expect(upstream).toHaveBeenCalledTimes(1);
  });

  it("returns an explicit 429 without calling Seoul when a reservation is denied", async () => {
    const upstream = vi.fn();
    const budget = budgetFixture({
      allowed: false,
      reason: "paced",
      retryAt: Date.parse("2026-09-08T12:12:24.000Z"),
    });
    const app = createApp(upstream, {
      subwayArrivalUpstream: "https://subway-arrival.test",
      subwayApiKeyScope: scopeHash,
      subwayRequestBudget: budget,
      now: () => Date.parse("2026-09-08T12:10:00.000Z"),
    });

    const response = await app.request(
      "/api/subway/arrivals?station=%EC%B2%9C%ED%98%B8",
    );

    expect(response.status).toBe(429);
    expect(await response.json()).toMatchObject({
      error: "SUBWAY_REQUEST_RATE_LIMITED",
      retryAt: "2026-09-08T12:12:24.000Z",
    });
    expect(upstream).not.toHaveBeenCalled();
  });

  it("turns an upstream ERROR-337 into a persisted cooldown response", async () => {
    const upstream = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          status: 500,
          code: "ERROR-337",
          message: "daily quota",
        }),
        { status: 500, headers: { "content-type": "application/json" } },
      ),
    );
    const now = Date.parse("2026-09-08T12:10:00.000Z");
    const budget = budgetFixture({ allowed: true, retryAt: null });
    const app = createApp(upstream, {
      subwayArrivalUpstream: "https://subway-arrival.test",
      subwayApiKeyScope: scopeHash,
      subwayRequestBudget: budget,
      now: () => now,
    });

    const response = await app.request(
      "/api/subway/arrivals?station=%EC%B2%9C%ED%98%B8",
    );

    expect(response.status).toBe(429);
    expect(await response.json()).toMatchObject({
      error: "SUBWAY_QUOTA_COOLDOWN",
      retryAt: "2026-09-09T12:10:00.000Z",
    });
    expect(budget.markQuotaExhausted).toHaveBeenCalledWith(scopeHash, now);

    const blocked = await app.request(
      "/api/subway/arrivals?station=%EC%B2%9C%ED%98%B8",
    );
    expect(blocked.status).toBe(429);
    expect((await blocked.json()).error).toBe("SUBWAY_QUOTA_COOLDOWN");
    expect(upstream).toHaveBeenCalledTimes(1);
    expect(budget.reserveArrival).toHaveBeenCalledTimes(1);
  });
});
