import { describe, expect, it, vi } from "vitest";
import type { RepeatingScheduler } from "../app.tokens";
import type { SubwayPositionResult } from "../upstream/subwayPositions";
import { SubwayPositionCollector } from "./subwayPositionCollector";

const capturedAt = "2026-09-04T19:00:00.000Z";

function position(line: string): SubwayPositionResult {
	return {
		availability: "live",
		capturedAt,
		vehicles: [
			{
				id: `subway:${line}:1`,
				mode: "subway",
				routeId: line,
				routeName: line,
				coordinates: [127.11, 37.53],
				bearing: 0,
				direction: "상행",
				capturedAt,
				positionBasis: "station-segment",
			},
		],
	};
}

function manualScheduler() {
	let tick: (() => Promise<void>) | undefined;
	const stop = vi.fn();
	const scheduler: RepeatingScheduler = {
		every: vi.fn((intervalMs, task) => {
			expect(intervalMs).toBe(10_000);
			tick = task;
			return stop;
		}),
	};
	return { scheduler, stop, run: () => tick?.() };
}

describe("SubwayPositionCollector", () => {
	it("shares one poll sequence across subscribers and replaces the snapshot", async () => {
		const clock = manualScheduler();
		const loadLine = vi.fn((line: string) => Promise.resolve(position(line)));
		const collector = new SubwayPositionCollector({
			lines: ["1호선", "2호선"],
			loadLine,
			scheduler: clock.scheduler,
			now: () => Date.parse("2026-09-05T04:00:00.000Z"),
		});
		const first = vi.fn();
		const second = vi.fn();

		const unsubscribeFirst = collector.subscribe(first);
		const unsubscribeSecond = collector.subscribe(second);
		await vi.waitFor(() => expect(loadLine).toHaveBeenCalledTimes(2));
		await vi.waitFor(() => expect(collector.snapshot().availability).toBe("live"));

		expect(clock.scheduler.every).toHaveBeenCalledTimes(1);
		expect(collector.snapshot().vehicles).toHaveLength(2);
		expect(collector.snapshot().capturedAt).toBe(capturedAt);
		expect(first).toHaveBeenLastCalledWith(collector.snapshot());
		expect(second).toHaveBeenLastCalledWith(collector.snapshot());

		unsubscribeFirst();
		expect(clock.stop).not.toHaveBeenCalled();
		unsubscribeSecond();
		expect(clock.stop).toHaveBeenCalledTimes(1);
	});

	it("clears every train when one line fails", async () => {
		const clock = manualScheduler();
		const collector = new SubwayPositionCollector({
			lines: ["1호선", "2호선"],
			loadLine: (line) =>
				line === "2호선"
					? Promise.reject(new Error("line unavailable"))
					: Promise.resolve(position(line)),
			scheduler: clock.scheduler,
			now: () => Date.parse("2026-09-05T04:00:00.000Z"),
		});

		const unsubscribe = collector.subscribe(vi.fn());
		await vi.waitFor(() =>
			expect(collector.status().failureCount).toBe(1),
		);

		expect(collector.snapshot()).toMatchObject({
			availability: "unavailable",
			vehicles: [],
		});
		expect(collector.status()).toMatchObject({
			status: "unavailable",
			failureCount: 1,
			consecutiveFailures: 1,
		});
		unsubscribe();
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
});
