import type { MessageEvent } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { RepeatingScheduler } from "../app.tokens";
import type { SubwayPositionSnapshot } from "./subwayPositionCollector";
import {
	type BusPositionSnapshot,
	TransitMapStreamService,
} from "./transitMapStream.service";

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

const bus = {
	...train,
	id: "bus:route-1:vehicle-1",
	mode: "bus" as const,
	routeId: "route-1",
	routeName: "노선 1",
	positionBasis: "gps" as const,
};

const outsideBus = {
	...bus,
	id: "bus:route-1:vehicle-outside",
	coordinates: [127.2, 37.6] as [number, number],
};

const network = {
	revision: "revision-1",
	generatedAt: "2026-09-05T00:00:00.000Z",
	subway: {
		attribution: "© OpenStreetMap contributors, ODbL",
		lines: { type: "FeatureCollection" as const, features: [] },
		stations: { type: "FeatureCollection" as const, features: [] },
	},
	bus: {
		enabled: true,
		attribution: "서울특별시 교통정보",
		routes: {
			type: "FeatureCollection" as const,
			features: [
				{
					type: "Feature" as const,
					properties: {
						routeId: "route-1",
						routeName: "노선 1",
						color: "#2563eb",
					},
					geometry: {
						type: "LineString" as const,
						coordinates: [
							[127.1, 37.52] as [number, number],
							[127.12, 37.54] as [number, number],
						],
					},
				},
			],
		},
		stops: { type: "FeatureCollection" as const, features: [] },
	},
};

function setup() {
	let subwayListener: ((snapshot: SubwayPositionSnapshot) => void) | undefined;
	let busListener: ((snapshot: BusPositionSnapshot) => void) | undefined;
	let heartbeat: (() => Promise<void>) | undefined;
	const stopHeartbeat = vi.fn();
	const stopSubway = vi.fn();
	const stopBus = vi.fn();
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
	const busSnapshot: BusPositionSnapshot = {
		availability: "live" as const,
		vehicles: [bus, outsideBus],
		capturedAt: bus.capturedAt,
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
		{
			acquire: (_routeIds, listener) => {
				busListener = listener;
				listener(busSnapshot);
				return stopBus;
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
		stopBus,
		heartbeat: () => heartbeat?.(),
		emitSubway: (snapshot: SubwayPositionSnapshot) => subwayListener?.(snapshot),
		emitBusUnavailable: () =>
			busListener?.({
				availability: "unavailable",
				vehicles: [],
				capturedAt: "2026-09-05T04:00:15.000Z",
			}),
	};
}

describe("TransitMapStreamService", () => {
	it("emits ready, availability, and complete vehicles before heartbeats", async () => {
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
		expect(messages[2]?.data).toMatchObject({
			kind: "vehicles",
			bus: [bus],
			subway: [train],
		});
		await fixture.heartbeat();
		expect(messages.at(-1)?.type).toBe("heartbeat");
		subscription.unsubscribe();
	});

	it("clears an unavailable mode in the same stream turn", async () => {
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
		expect(messages.at(-1)?.data).toMatchObject({ subway: [], bus: [bus] });

		fixture.emitBusUnavailable();
		expect(messages.at(-1)?.data).toMatchObject({ subway: [], bus: [] });
		subscription.unsubscribe();
	});

	it("releases both collectors and the heartbeat on unsubscribe", async () => {
		const fixture = setup();
		const subscription = fixture.service.events(query).subscribe();
		await vi.waitFor(() => expect(fixture.scheduler.every).toHaveBeenCalledOnce());

		subscription.unsubscribe();
		expect(fixture.stopSubway).toHaveBeenCalledOnce();
		expect(fixture.stopBus).toHaveBeenCalledOnce();
		expect(fixture.stopHeartbeat).toHaveBeenCalledOnce();
	});
});
