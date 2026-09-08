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
			expect(width).toBeCloseTo(heading === 0 ? 3.2 : 31, 5);
			expect(length).toBeCloseTo(heading === 0 ? 31 : 3.2, 5);
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
		expect(
			features.every((feature) => {
				const ring = feature.geometry.coordinates[0];
				return Boolean(
					ring &&
					ring.length >= 5 &&
					ring[0]?.join(",") === ring.at(-1)?.join(","),
				);
			}),
		).toBe(true);
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
			const corners = ring.slice(0, -1) as Array<[number, number]>;
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

		// The band remains large enough to read at close-model LOD without becoming
		// a full-height fluorescent block.
		expect(stripe.height - stripe.base).toBeGreaterThanOrEqual(0.6);
		expect(stripe.height - stripe.base).toBeLessThan(1);
		// The belt slightly overhangs the shell and doors, while the window band
		// stays inset so the side reads as a layered vehicle rather than a box.
		expect(stripe.widthM).toBeGreaterThan(body.widthM + 0.05);
		expect(stripe.widthM).toBeGreaterThan(windows.widthM + 0.05);
		expect(stripe.widthM).toBeGreaterThan(door.widthM + 0.02);

		// The car stack must be gapless: livery and glazing overlap at their
		// boundary, and the roof overlaps the glazing instead of floating above it.
		expect(stripe.base).toBeLessThan(body.height);
		expect(windows.base).toBeLessThanOrEqual(stripe.height);
		expect(roof.base).toBeLessThan(windows.height);
	});

	it("uses neutral silver materials and beveled cab glazing instead of a lime roof", () => {
		const features = vehicleModels([train], routes).features;
		const featureOf = (part: string) => {
			const feature = features.find((item) => item.properties.part === part);
			if (!feature) throw new Error(`Missing ${part}`);
			return feature;
		};
		const cab = featureOf("front-cab");
		const windshield = featureOf("front-windshield");
		const body = featureOf("car-2-body");
		const roof = featureOf("roof-center");
		const coupling = featureOf("car-divider-front");

		expect(body.properties.color).toBe("#d4dad8");
		expect(roof.properties.color).toBe("#eef1ee");
		expect(featureOf("car-2-stripe").properties.color).toBe("#e6186c");
		expect(features.some((feature) => feature.properties.color === "#c7f000")).toBe(false);
		expect(cab.geometry.coordinates[0]).toHaveLength(9);
		expect(windshield.geometry.coordinates[0]).toHaveLength(9);

		const widthOf = (feature: (typeof features)[number]) => {
			const ring = feature.geometry.coordinates[0];
			if (!ring) throw new Error("Missing part ring");
			return (
				Math.max(...ring.map((point) => point[0])) -
				Math.min(...ring.map((point) => point[0]))
			);
		};
		expect(widthOf(coupling)).toBeLessThan(widthOf(body) * 0.5);
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
