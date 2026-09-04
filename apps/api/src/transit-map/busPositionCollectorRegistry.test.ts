import { describe, expect, it, vi } from "vitest";
import type { RepeatingScheduler } from "../app.tokens";
import type { BusPositionResult } from "../upstream/seoulBusPositions";
import {
	BusPositionCollectorRegistry,
	type BusRegistrySnapshot,
} from "./busPositionCollectorRegistry";

function result(routeId: string): BusPositionResult {
	return {
		availability: "live",
		capturedAt: "2026-09-05T04:00:00.000Z",
		vehicles: [
			{
				id: `bus:${routeId}:1`,
				mode: "bus",
				routeId,
				routeName: routeId,
				coordinates: [127.11, 37.53],
				bearing: 0,
				direction: "1번째 구간",
				capturedAt: "2026-09-05T04:00:00.000Z",
				positionBasis: "gps",
			},
		],
	};
}

function schedulerFixture() {
	const tasks = new Map<number, () => Promise<void>>();
	const stops: ReturnType<typeof vi.fn>[] = [];
	let sequence = 0;
	const scheduler: RepeatingScheduler = {
		every: vi.fn((intervalMs, task) => {
			expect(intervalMs).toBe(15_000);
			sequence += 1;
			tasks.set(sequence, task);
			const stop = vi.fn(() => tasks.delete(sequence));
			stops.push(stop);
			return stop;
		}),
	};
	return { scheduler, tasks, stops };
}

describe("BusPositionCollectorRegistry", () => {
	it("shares overlapping route collectors and stops them at zero references", async () => {
		const clock = schedulerFixture();
		const loadRoute = vi.fn((routeId: string) => Promise.resolve(result(routeId)));
		const registry = new BusPositionCollectorRegistry({
			loadRoute,
			scheduler: clock.scheduler,
		});
		const first = vi.fn<(snapshot: BusRegistrySnapshot) => void>();
		const second = vi.fn<(snapshot: BusRegistrySnapshot) => void>();

		const releaseFirst = registry.acquire(["a", "b"], first);
		const releaseSecond = registry.acquire(["b", "c"], second);
		await vi.waitFor(() => expect(loadRoute).toHaveBeenCalledTimes(3));
		await vi.waitFor(() => expect(first.mock.lastCall?.[0].availability).toBe("live"));
		await vi.waitFor(() => expect(second.mock.lastCall?.[0].availability).toBe("live"));

		expect(clock.scheduler.every).toHaveBeenCalledTimes(3);
		expect(
			loadRoute.mock.calls.map(([routeId]) => routeId).sort(),
		).toEqual(["a", "b", "c"]);
		releaseFirst();
		expect(clock.stops.filter((stop) => stop.mock.calls.length > 0)).toHaveLength(1);
		releaseSecond();
		expect(clock.stops.every((stop) => stop.mock.calls.length === 1)).toBe(true);
		expect(registry.collectorCount()).toBe(0);
	});

	it("polls each active route once per fifteen-second tick", async () => {
		const clock = schedulerFixture();
		const loadRoute = vi.fn((routeId: string) => Promise.resolve(result(routeId)));
		const registry = new BusPositionCollectorRegistry({
			loadRoute,
			scheduler: clock.scheduler,
		});
		const release = registry.acquire(["a"], vi.fn());
		await vi.waitFor(() => expect(registry.status().status).toBe("live"));

		await [...clock.tasks.values()][0]?.();
		expect(loadRoute).toHaveBeenCalledTimes(2);
		release();
	});

	it("emits one complete empty snapshot when any active route fails", async () => {
		const clock = schedulerFixture();
		const registry = new BusPositionCollectorRegistry({
			loadRoute: (routeId) =>
				routeId === "b"
					? Promise.reject(new Error("route failed"))
					: Promise.resolve(result(routeId)),
			scheduler: clock.scheduler,
		});
		const listener = vi.fn<(snapshot: BusRegistrySnapshot) => void>();

		const release = registry.acquire(["a", "b"], listener);
		await vi.waitFor(() => expect(registry.status().failureCount).toBe(1));
		expect(listener.mock.lastCall?.[0]).toMatchObject({
			availability: "unavailable",
			vehicles: [],
		});
		release();
	});
});
