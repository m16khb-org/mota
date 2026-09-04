import { describe, expect, it } from "vitest";
import {
	transitAvailabilitySchema,
	transitMapEventSchema,
	transitMapHealthSchema,
	transitMapNetworkSchema,
	transitMapQuerySchema,
} from "./transitMap";

const query = {
	west: 127.1,
	south: 37.52,
	east: 127.12,
	north: 37.54,
	zoom: 16,
};

const vehicle = {
	id: "subway:1002:2012",
	mode: "subway",
	routeId: "1002",
	routeName: "2호선",
	coordinates: [127.111, 37.531],
	bearing: 92,
	direction: "성수 방면",
	capturedAt: "2026-09-05T04:00:00.000Z",
	positionBasis: "station-segment",
};

const emptyFeatureCollection = {
	type: "FeatureCollection",
	features: [],
};

describe("transitMapQuerySchema", () => {
	it("accepts a bounded Seoul viewport from URL query strings", () => {
		expect(
			transitMapQuerySchema.parse(
				Object.fromEntries(
					Object.entries(query).map(([key, value]) => [key, String(value)]),
				),
			),
		).toEqual(query);
	});

	it("rejects reversed longitude and latitude bounds", () => {
		expect(() =>
			transitMapQuerySchema.parse({ ...query, west: query.east, east: query.west }),
		).toThrow();
		expect(() =>
			transitMapQuerySchema.parse({ ...query, south: query.north, north: query.south }),
		).toThrow();
	});

	it("accepts a wide viewport so the service can return zoom-required", () => {
		expect(
			transitMapQuerySchema.safeParse({
				west: 126.9,
				south: 37.4,
				east: 127.1,
				north: 37.6,
				zoom: 16,
			}).success,
		).toBe(true);
	});

	it("accepts the same wide viewport below the bus-live zoom threshold", () => {
		expect(
			transitMapQuerySchema.safeParse({
				west: 126.9,
				south: 37.4,
				east: 127.1,
				north: 37.6,
				zoom: 15,
			}).success,
		).toBe(true);
	});
});

describe("transit map payload schemas", () => {
	it("accepts every public availability state", () => {
		for (const state of [
			"live",
			"no-service",
			"unavailable",
			"unconfigured",
			"zoom-required",
		]) {
			expect(transitAvailabilitySchema.parse(state)).toBe(state);
		}
	});

	it("accepts a complete network payload", () => {
		const payload = {
			revision: "network-2026-09-05",
			generatedAt: "2026-09-05T00:00:00.000Z",
			subway: {
				attribution: "© OpenStreetMap contributors, ODbL",
				lines: emptyFeatureCollection,
				stations: emptyFeatureCollection,
			},
			bus: {
				enabled: false,
				reason: "zoom-required",
				attribution: "서울특별시 교통정보",
				routes: emptyFeatureCollection,
				stops: emptyFeatureCollection,
			},
		};

		expect(transitMapNetworkSchema.parse(payload)).toEqual(payload);
	});

	it("accepts ready, vehicles, availability, and heartbeat events", () => {
		const events = [
			{
				kind: "ready",
				revision: "network-2026-09-05",
				modes: ["bus", "subway"],
				serverTime: "2026-09-05T04:00:00.000Z",
			},
			{
				kind: "vehicles",
				bus: [],
				subway: [vehicle],
				capturedAt: "2026-09-05T04:00:00.000Z",
			},
			{
				kind: "availability",
				bus: "zoom-required",
				subway: "live",
				observedAt: "2026-09-05T04:00:00.000Z",
			},
			{
				kind: "heartbeat",
				serverTime: "2026-09-05T04:00:15.000Z",
			},
		];

		for (const event of events) {
			expect(transitMapEventSchema.parse(event)).toEqual(event);
		}
	});

	it("rejects latitude-longitude coordinate order", () => {
		expect(() =>
			transitMapEventSchema.parse({
				kind: "vehicles",
				bus: [],
				subway: [{ ...vehicle, coordinates: [37.531, 127.111] }],
				capturedAt: "2026-09-05T04:00:00.000Z",
			}),
		).toThrow();
	});

	it("accepts bounded, non-gating source health metrics", () => {
		expect(
			transitMapHealthSchema.parse({
				subway: {
					status: "live",
					successCount: 3,
					failureCount: 1,
					consecutiveFailures: 0,
					lastSuccessAt: "2026-09-05T04:00:00.000Z",
					lastFailureAt: null,
					lastDurationMs: 42,
				},
				bus: {
					status: "unconfigured",
					successCount: 0,
					failureCount: 0,
					consecutiveFailures: 0,
					lastSuccessAt: null,
					lastFailureAt: null,
					lastDurationMs: null,
				},
			}),
		).toBeTruthy();
	});
});
