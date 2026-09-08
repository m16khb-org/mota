import type { MessageEvent } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { RepeatingScheduler } from "../app.tokens";
import type { SubwayPositionSnapshot } from "./subwayPositionCollector";
import { TransitMapStreamService } from "./transitMapStream.service";

const query = {
	west: 127.1,
	south: 37.52,
	east: 127.12,
	north: 37.54,
	zoom: 16,
};

const train = {
	id: "subway:1008:8120",
	mode: "subway" as const,
	routeId: "1008",
	routeName: "8호선",
	coordinates: [127.11, 37.53] as [number, number],
	bearing: 0,
	direction: "상행",
	capturedAt: "2026-09-05T04:00:00.000Z",
	positionBasis: "station-segment" as const,
};

const network = {
	revision: "revision-1",
	generatedAt: "2026-09-05T00:00:00.000Z",
	subway: {
		attribution: "© OpenStreetMap contributors, ODbL",
		lines: { type: "FeatureCollection" as const, features: [] },
		stations: { type: "FeatureCollection" as const, features: [] },
	},
};

function setup() {
	let subwayListener: ((snapshot: SubwayPositionSnapshot) => void) | undefined;
	let heartbeat: (() => Promise<void>) | undefined;
	const stopHeartbeat = vi.fn();
	const stopSubway = vi.fn();
	const scheduler: RepeatingScheduler = {
		every: vi.fn((intervalMs, task) => {
			expect(intervalMs).toBe(15_000);
			heartbeat = task;
			return stopHeartbeat;
		}),
	};
	const subwaySnapshot: SubwayPositionSnapshot = {
		availability: "live",
		vehicles: [train],
		capturedAt: train.capturedAt,
	};
	const service = new TransitMapStreamService(
		{ network: vi.fn().mockResolvedValue(network) },
		{
			snapshot: () => subwaySnapshot,
			subscribe: (listener) => {
				subwayListener = listener;
				listener(subwaySnapshot);
				return stopSubway;
			},
		},
		scheduler,
		() => Date.parse("2026-09-05T04:00:15.000Z"),
	);
	return {
		service,
		scheduler,
		stopHeartbeat,
		stopSubway,
		heartbeat: () => heartbeat?.(),
		emitSubway: (snapshot: SubwayPositionSnapshot) => subwayListener?.(snapshot),
	};
}

describe("TransitMapStreamService", () => {
	it("emits subway-only ready, availability, and vehicle snapshots", async () => {
		const fixture = setup();
		const messages: MessageEvent[] = [];
		const subscription = fixture.service
			.events(query)
			.subscribe((message) => messages.push(message));
		await vi.waitFor(() => expect(messages).toHaveLength(3));

		expect(messages.map((message) => message.type)).toEqual([
			"ready",
			"availability",
			"vehicles",
		]);
		expect(messages[0]?.data).toMatchObject({ modes: ["subway"] });
		expect(messages[1]?.data).toMatchObject({ subway: "live" });
		expect(messages[2]?.data).toMatchObject({ subway: [train] });
		for (const message of messages) {
			expect(message.data).not.toHaveProperty("bus");
		}

		await fixture.heartbeat();
		expect(messages.at(-1)?.type).toBe("heartbeat");
		subscription.unsubscribe();
	});

	it("publishes subway changes and releases only the subway subscription", async () => {
		const fixture = setup();
		const messages: MessageEvent[] = [];
		const subscription = fixture.service
			.events(query)
			.subscribe((message) => messages.push(message));
		await vi.waitFor(() => expect(messages).toHaveLength(3));

		fixture.emitSubway({
			availability: "unavailable",
			vehicles: [],
			capturedAt: "2026-09-05T04:00:15.000Z",
		});
		expect(messages.slice(-2).map((message) => message.type)).toEqual([
			"availability",
			"vehicles",
		]);
		expect(messages.at(-1)?.data).toMatchObject({ subway: [] });
		expect(messages.at(-2)?.data).toMatchObject({ subway: "unavailable" });

		subscription.unsubscribe();
		expect(fixture.stopSubway).toHaveBeenCalledOnce();
		expect(fixture.stopHeartbeat).toHaveBeenCalledOnce();
	});
});
