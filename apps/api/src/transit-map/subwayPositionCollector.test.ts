import type { SubwayRequestBudget } from "@mota/db";
import { describe, expect, it, vi } from "vitest";
import type { RepeatingScheduler } from "../app.tokens";
import type { SubwayPositionResult } from "../upstream/subwayPositions";
import { UpstreamError } from "../upstream/upstreamError";
import {
	SUBWAY_POSITION_QUOTA_REPROBE_DELAY_MS,
	SUBWAY_POSITION_REQUEST_INTERVAL_MS,
	SubwayPositionCollector,
} from "./subwayPositionCollector";

const capturedAt = "2026-09-04T19:00:00.000Z";

function position(line: string, at = capturedAt): SubwayPositionResult {
	return {
		availability: "live",
		capturedAt: at,
		vehicles: [
			{
				id: `subway:${line}:1`,
				mode: "subway",
				routeId: line,
				routeName: line,
				coordinates: [127.11, 37.53],
				bearing: 0,
				direction: "상행",
				capturedAt: at,
				positionBasis: "station-segment",
			},
		],
	};
}

function manualScheduler(
	expectedInterval = SUBWAY_POSITION_REQUEST_INTERVAL_MS,
) {
	let tick: (() => Promise<void>) | undefined;
	const stop = vi.fn();
	const scheduler: RepeatingScheduler = {
		every: vi.fn((intervalMs, task) => {
			expect(intervalMs).toBe(expectedInterval);
			tick = task;
			return stop;
		}),
	};
	return { scheduler, stop, run: () => tick?.() };
}

function manualExpirationScheduler() {
	let task: (() => void) | undefined;
	const stop = vi.fn();
	const schedule = vi.fn((_delayMs: number, next: () => void) => {
		task = next;
		return stop;
	});
	return { schedule, stop, run: () => task?.() };
}

describe("SubwayPositionCollector", () => {
	it("shares one poll sequence across subscribers and replaces the snapshot", async () => {
		const clock = manualScheduler();
		const loadLine = vi.fn((line: string) => Promise.resolve(position(line)));
		const collector = new SubwayPositionCollector({
			lines: ["1호선", "2호선"],
			loadLine,
			scheduler: clock.scheduler,
			now: () => Date.parse("2026-09-04T19:01:00.000Z"),
		});
		const first = vi.fn();
		const second = vi.fn();

		const unsubscribeFirst = collector.subscribe(first);
		const unsubscribeSecond = collector.subscribe(second);
		await vi.waitFor(() => expect(loadLine).toHaveBeenCalledTimes(1));
		await vi.waitFor(() => expect(collector.snapshot().availability).toBe("live"));

		expect(clock.scheduler.every).toHaveBeenCalledTimes(1);
		expect(collector.snapshot().vehicles).toMatchObject([
			{ id: "subway:1호선:1" },
		]);
		const nextTurn = clock.run();
		if (nextTurn) await nextTurn;
		expect(loadLine).toHaveBeenCalledTimes(2);
		expect(collector.snapshot().vehicles).toMatchObject([
			{ id: "subway:2호선:1" },
		]);
		expect(collector.snapshot().capturedAt).toBe(capturedAt);
		expect(first).toHaveBeenLastCalledWith(collector.snapshot());
		expect(second).toHaveBeenLastCalledWith(collector.snapshot());

		unsubscribeFirst();
		expect(clock.stop).not.toHaveBeenCalled();
		unsubscribeSecond();
		expect(clock.stop).toHaveBeenCalledTimes(1);
	});

	it("drops station observations older than the freshness window", async () => {
		const clock = manualScheduler();
		const fresh = position("1호선", "2026-09-05T03:58:31.000Z").vehicles[0];
		const stale = position("1호선", "2026-09-05T03:58:29.000Z").vehicles[0];
		if (!fresh || !stale) throw new Error("Test fixture did not create vehicles.");
		const loadLine = vi.fn().mockResolvedValue({
			availability: "live" as const,
			capturedAt: fresh.capturedAt,
			vehicles: [
				{ ...fresh, id: "fresh" },
				{ ...stale, id: "stale" },
			],
		});
		const collector = new SubwayPositionCollector({
			lines: ["1호선"],
			loadLine,
			scheduler: clock.scheduler,
			now: () => Date.parse("2026-09-05T04:00:00.000Z"),
		});

		const unsubscribe = collector.subscribe(vi.fn());
		await collector.poll();

		expect(collector.snapshot()).toMatchObject({
			availability: "live",
			capturedAt: fresh.capturedAt,
			vehicles: [{ id: "fresh", capturedAt: fresh.capturedAt }],
		});
		unsubscribe();
	});

	it("keeps station observations exactly at the freshness boundary", async () => {
		const clock = manualScheduler();
		const boundary = position(
			"1호선",
			"2026-09-05T03:58:30.000Z",
		).vehicles[0];
		if (!boundary) throw new Error("Test fixture did not create a vehicle.");
		const loadLine = vi.fn().mockResolvedValue({
			availability: "live" as const,
			capturedAt: boundary.capturedAt,
			vehicles: [{ ...boundary, id: "boundary" }],
		});
		const collector = new SubwayPositionCollector({
			lines: ["1호선"],
			loadLine,
			scheduler: clock.scheduler,
			now: () => Date.parse("2026-09-05T04:00:00.000Z"),
		});

		const unsubscribe = collector.subscribe(vi.fn());
		await collector.poll();

		expect(collector.snapshot()).toMatchObject({
			availability: "live",
			capturedAt: boundary.capturedAt,
			vehicles: [{ id: "boundary", capturedAt: boundary.capturedAt }],
		});
		unsubscribe();
	});

	it("reports unavailable when a live source has no fresh observations", async () => {
		const clock = manualScheduler();
		const stale = position(
			"1호선",
			"2026-09-05T03:58:29.000Z",
		).vehicles[0];
		if (!stale) throw new Error("Test fixture did not create a vehicle.");
		const loadLine = vi.fn().mockResolvedValue({
			availability: "live" as const,
			capturedAt: stale.capturedAt,
			vehicles: [{ ...stale, id: "stale" }],
		});
		const collector = new SubwayPositionCollector({
			lines: ["1호선"],
			loadLine,
			scheduler: clock.scheduler,
			now: () => Date.parse("2026-09-05T04:00:00.000Z"),
		});

		const unsubscribe = collector.subscribe(vi.fn());
		await collector.poll();

		expect(collector.snapshot()).toMatchObject({
			availability: "unavailable",
			vehicles: [],
			capturedAt: stale.capturedAt,
		});
		unsubscribe();
	});

	it("expires a live snapshot at the freshness boundary without polling upstream", async () => {
		const clock = manualScheduler();
		const expiration = manualExpirationScheduler();
		let now = Date.parse("2026-09-05T04:00:00.000Z");
		const capturedAt = new Date(now).toISOString();
		const loadLine = vi
			.fn()
			.mockResolvedValue(position("1호선", capturedAt));
		const listener = vi.fn();
		const collector = new SubwayPositionCollector({
			lines: ["1호선"],
			loadLine,
			scheduler: clock.scheduler,
			scheduleExpiration: expiration.schedule,
			now: () => now,
		});

		const unsubscribe = collector.subscribe(listener);
		await collector.poll();
		expect(collector.snapshot().availability).toBe("live");
		expect(loadLine).toHaveBeenCalledTimes(1);
		expect(expiration.schedule).toHaveBeenCalledWith(90_000, expect.any(Function));

		now += 90_000;
		expiration.run();
		expect(collector.snapshot().availability).toBe("live");
		expect(loadLine).toHaveBeenCalledTimes(1);

		now += 1;
		expiration.run();
		expect(collector.snapshot()).toMatchObject({
			availability: "unavailable",
			vehicles: [],
			capturedAt,
		});
		expect(loadLine).toHaveBeenCalledTimes(1);
		expect(listener).toHaveBeenLastCalledWith(collector.snapshot());

		unsubscribe();
		expect(expiration.stop).toHaveBeenCalled();
	});

	it("does not replay stale positions after the expiration timer was torn down", async () => {
		const clock = manualScheduler();
		const expiration = manualExpirationScheduler();
		let now = Date.parse("2026-09-05T04:00:00.000Z");
		const loadLine = vi.fn().mockResolvedValue(
			position("1호선", new Date(now).toISOString()),
		);
		const collector = new SubwayPositionCollector({
			lines: ["1호선"],
			loadLine,
			scheduler: clock.scheduler,
			scheduleExpiration: expiration.schedule,
			now: () => now,
		});

		const unsubscribe = collector.subscribe(vi.fn());
		await collector.poll();
		unsubscribe();
		now += 90_001;

		const reconnectListener = vi.fn();
		const reconnect = collector.subscribe(reconnectListener);
		expect(reconnectListener).toHaveBeenCalledWith(
			expect.objectContaining({ availability: "unavailable", vehicles: [] }),
		);
		reconnect();
	});

	it("advances fairly after a failed line turn", async () => {
		const clock = manualScheduler();
		const loadLine = vi.fn((line: string) =>
			line === "1호선"
				? Promise.reject(new Error("line unavailable"))
				: Promise.resolve(position(line)),
		);
		const collector = new SubwayPositionCollector({
			lines: ["1호선", "2호선"],
			loadLine,
			scheduler: clock.scheduler,
			now: () => Date.parse("2026-09-04T19:01:00.000Z"),
		});

		await collector.poll();
		expect(loadLine).toHaveBeenCalledTimes(1);
		expect(collector.snapshot()).toMatchObject({
			availability: "unavailable",
			vehicles: [],
		});

		await collector.poll();
		expect(loadLine).toHaveBeenCalledTimes(2);
		expect(collector.snapshot()).toMatchObject({
			availability: "live",
			vehicles: [{ id: "subway:2호선:1" }],
		});
		expect(collector.status()).toMatchObject({
			status: "live",
			failureCount: 1,
			consecutiveFailures: 0,
		});
	});

	it("reprobes after a bounded quota cooldown without calling upstream while blocked", async () => {
		const clock = manualScheduler();
		let current = Date.parse("2026-09-04T19:01:00.000Z");
		const loadLine = vi
			.fn<() => Promise<SubwayPositionResult>>()
			.mockImplementationOnce(async () =>
				position("1호선", new Date(current).toISOString()),
			)
			.mockRejectedValueOnce(
				new UpstreamError(
					"Subway positions upstream failed",
					"Subway positions for 1호선 returned 500 ERROR-337: daily quota",
				),
			)
			.mockImplementationOnce(async () =>
				position("1호선", new Date(current).toISOString()),
			);
		const collector = new SubwayPositionCollector({
			lines: ["1호선"],
			loadLine,
			scheduler: clock.scheduler,
			now: () => current,
		});

		const unsubscribe = collector.subscribe(vi.fn());
		await collector.poll();
		expect(collector.snapshot().availability).toBe("live");

		const quotaPoll = clock.run();
		if (quotaPoll) await quotaPoll;

		expect(loadLine).toHaveBeenCalledTimes(2);
		expect(collector.snapshot()).toMatchObject({
			availability: "unavailable",
			vehicles: [],
		});

		unsubscribe();
		expect(clock.stop).toHaveBeenCalledTimes(1);
		const reconnected = collector.subscribe(vi.fn());
		await collector.poll();
		expect(loadLine).toHaveBeenCalledTimes(2);

		current += SUBWAY_POSITION_QUOTA_REPROBE_DELAY_MS - 1;
		const blockedPoll = clock.run();
		if (blockedPoll) await blockedPoll;
		expect(loadLine).toHaveBeenCalledTimes(2);

		current += 1;
		const reprobe = clock.run();
		if (reprobe) await reprobe;
		expect(loadLine).toHaveBeenCalledTimes(3);
		expect(collector.snapshot().availability).toBe("live");

		reconnected();
		expect(clock.stop).toHaveBeenCalledTimes(2);
	});

	it("does not start another load while a poll is in flight", async () => {
		const clock = manualScheduler();
		let release: ((result: SubwayPositionResult) => void) | undefined;
		const loadLine = vi.fn(
			() =>
				new Promise<SubwayPositionResult>((resolve) => {
					release = resolve;
				}),
		);
		const collector = new SubwayPositionCollector({
			lines: ["1호선"],
			loadLine,
			scheduler: clock.scheduler,
		});

		const unsubscribe = collector.subscribe(vi.fn());
		await vi.waitFor(() => expect(loadLine).toHaveBeenCalledTimes(1));
		const overlappingTick = clock.run();
		expect(loadLine).toHaveBeenCalledTimes(1);
		release?.(position("1호선"));
		await overlappingTick;
		expect(loadLine).toHaveBeenCalledTimes(1);
		unsubscribe();
	});

	it("takes one persisted round-robin line per position turn", async () => {
		const lines = Array.from({ length: 16 }, (_, index) => `${index + 1}호선`);
		const clock = manualScheduler(SUBWAY_POSITION_REQUEST_INTERVAL_MS);
		const now = Date.parse("2026-09-08T12:00:00.000Z");
		let nextLine = 0;
		const budget: SubwayRequestBudget = {
			reserveArrival: vi.fn(),
			reservePosition: vi.fn(async (_scope, requestedLines) => ({
				allowed: true,
				retryAt: null,
				line: requestedLines[nextLine++],
			})),
			markQuotaExhausted: vi.fn().mockResolvedValue(undefined),
		};
		const loadLine = vi.fn((line: string) =>
			Promise.resolve(position(line, new Date(now).toISOString())),
		);
		const collector = new SubwayPositionCollector({
			lines,
			loadLine,
			scheduler: clock.scheduler,
			requestBudget: budget,
			scopeHash: "scope",
			now: () => now,
		});

		const unsubscribe = collector.subscribe(vi.fn());
		await vi.waitFor(() => expect(loadLine).toHaveBeenCalledTimes(1));
		for (let turn = 1; turn < lines.length; turn += 1) {
			const tick = clock.run();
			if (tick) await tick;
		}

		expect(loadLine.mock.calls.map(([line]) => line)).toEqual(lines);
		expect(budget.reservePosition).toHaveBeenCalledTimes(lines.length);
		unsubscribe();
	});

	it("does not stamp a denied position turn as fresh data", async () => {
		const now = Date.parse("2026-09-08T12:00:00.000Z");
		const clock = manualScheduler(SUBWAY_POSITION_REQUEST_INTERVAL_MS);
		const budget: SubwayRequestBudget = {
			reserveArrival: vi.fn(),
			reservePosition: vi.fn().mockResolvedValue({
				allowed: false,
				reason: "paced",
				retryAt: now + SUBWAY_POSITION_REQUEST_INTERVAL_MS,
			}),
			markQuotaExhausted: vi.fn().mockResolvedValue(undefined),
		};
		const loadLine = vi.fn();
		const collector = new SubwayPositionCollector({
			lines: ["1호선"],
			loadLine,
			scheduler: clock.scheduler,
			requestBudget: budget,
			scopeHash: "scope",
			now: () => now,
		});

		const initial = collector.snapshot().capturedAt;
		const unsubscribe = collector.subscribe(vi.fn());
		await vi.waitFor(() =>
			expect(budget.reservePosition).toHaveBeenCalledTimes(1),
		);

		expect(loadLine).not.toHaveBeenCalled();
		expect(collector.snapshot()).toMatchObject({
			availability: "unavailable",
			vehicles: [],
			capturedAt: initial,
		});
		unsubscribe();
	});
});
