import { describe, expect, it } from "vitest";
import type { SubwayVehicle, TransitMapNetwork } from "@mota/contracts/transit-map";
import { vehicleModels, vehiclePoints } from "./transitModels";

const routes: TransitMapNetwork["subway"]["lines"] = {
	type: "FeatureCollection",
	features: [
		{
			type: "Feature",
			properties: { routeId: "8", routeName: "8호선", color: "#e6186c" },
			geometry: {
				type: "LineString",
				coordinates: [
					[127.1, 37.5],
					[127.101, 37.5],
				],
			},
		},
	],
};

const train: SubwayVehicle = {
	id: "subway:8:8120",
	mode: "subway",
	routeId: "8",
	routeName: "8호선",
	coordinates: [127.124, 37.536],
	bearing: 0,
	direction: "암사행",
	capturedAt: "2026-09-05T04:00:00.000Z",
	positionBasis: "station-segment",
};

describe("subway train model geometry", () => {
	it("keeps a 31m train centered on its observation and rotates its long axis", () => {
		for (const heading of [0, 90]) {
			const chassis = vehicleModels([{ ...train, bearing: heading }], routes).features.find(
				(part) => part.properties.part === "chassis",
			);
			const ring = chassis?.geometry.coordinates[0];
			if (!ring) throw new Error("Missing train chassis geometry");
			const corners = ring.slice(0, 4);
			expect(corners.reduce((sum, point) => sum + point[0], 0) / 4).toBeCloseTo(127.124, 9);
			expect(corners.reduce((sum, point) => sum + point[1], 0) / 4).toBeCloseTo(37.536, 9);
			const width =
				(Math.max(...corners.map((point) => point[0])) -
					Math.min(...corners.map((point) => point[0]))) *
				111195 *
				Math.cos((37.536 * Math.PI) / 180);
			const length =
				(Math.max(...corners.map((point) => point[1])) -
					Math.min(...corners.map((point) => point[1]))) *
				111195;
			expect(width).toBeCloseTo(heading === 0 ? 3.6 : 31, 5);
			expect(length).toBeCloseTo(heading === 0 ? 31 : 3.6, 5);
			expect(ring[0]).toEqual(ring[4]);
		}
	});

	it("builds a multi-car silhouette with route-colored livery and recognizable details", () => {
		const features = vehicleModels([train], routes).features;
		const parts = new Set(features.map((feature) => feature.properties.part));

		expect(features).toHaveLength(29);
		expect(parts).toEqual(
			new Set([
				"chassis",
				"car-1-body",
				"car-1-stripe",
				"car-1-window-band",
				"car-1-door-front",
				"car-1-door-rear",
				"car-2-body",
				"car-2-stripe",
				"car-2-window-band",
				"car-2-door-front",
				"car-2-door-rear",
				"car-3-body",
				"car-3-stripe",
				"car-3-window-band",
				"car-3-door-front",
				"car-3-door-rear",
				"car-divider-front",
				"car-divider-rear",
				"front-cab",
				"front-windshield",
				"rear-cab",
				"rear-windshield",
				"roof-equipment-front",
				"roof-equipment-center",
				"roof-equipment-rear",
				"pantograph",
				"roof-front",
				"roof-center",
				"roof-rear",
			]),
		);
		expect(
			features.find((feature) => feature.properties.part === "car-2-stripe")?.properties.color,
		).toBe("#e6186c");
		expect(features.every((feature) => feature.geometry.type === "Polygon")).toBe(true);
		expect(features.every((feature) => feature.geometry.coordinates[0]?.length === 5)).toBe(true);
		expect(
			features.every((feature) => feature.properties.height > feature.properties.base),
		).toBe(true);
	});

	it("builds a livery band bold enough to survive LOD zoom antialiasing", () => {
		const features = vehicleModels([train], routes).features;
		const boxOf = (part: string) => {
			const feature = features.find((item) => item.properties.part === part);
			if (!feature) throw new Error(`Missing ${part}`);
			const ring = feature.geometry.coordinates[0];
			if (!ring) throw new Error(`Missing ${part} ring`);
			const corners = ring.slice(0, 4) as Array<[number, number]>;
			const lat = (37.536 * Math.PI) / 180;
			return {
				widthM:
					(Math.max(...corners.map((p) => p[0])) - Math.min(...corners.map((p) => p[0]))) *
					111195 *
					Math.cos(lat),
				base: Number(feature.properties.base),
				height: Number(feature.properties.height),
			};
		};
		const body = boxOf("car-2-body");
		const stripe = boxOf("car-2-stripe");
		const windows = boxOf("car-2-window-band");
		const door = boxOf("car-2-door-front");
		const roof = boxOf("roof-center");

		// A sub-half-metre band renders sub-pixel at the model LOD zooms and
		// antialiases away; the line color must be readable on the flank.
		expect(stripe.height - stripe.base).toBeGreaterThanOrEqual(1);
		// The belt must protrude past the body, the window band and the doors so
		// it stays continuous from above and from both flanks.
		expect(stripe.widthM).toBeGreaterThan(body.widthM + 0.1);
		expect(stripe.widthM).toBeGreaterThan(windows.widthM + 0.05);
		expect(stripe.widthM).toBeGreaterThan(door.widthM + 0.01);

		// The car stack must be gapless: livery band overlaps the body top, the
		// window band starts where the livery band ends, and the roof sits on
		// the window band instead of floating above it.
		expect(stripe.base).toBeLessThan(body.height);
		expect(windows.base).toBeCloseTo(stripe.height, 9);
		expect(roof.base).toBeCloseTo(windows.height, 9);
	});

	it("uses the same authoritative line color for the far readable point", () => {
		const point = vehiclePoints([train], routes).features[0];

		expect(point?.geometry.type).toBe("Point");
		expect(point?.geometry.coordinates).toEqual(train.coordinates);
		expect(point?.properties.color).toBe("#e6186c");
	});

	it("returns empty geometry for an empty subway snapshot", () => {
		expect(vehicleModels([], routes).features).toEqual([]);
		expect(vehiclePoints([], routes).features).toEqual([]);
	});
});
