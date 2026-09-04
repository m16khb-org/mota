import { describe, expect, it } from "vitest";
import {
	filterSubwayNetwork,
	loadSubwayNetwork,
} from "./subwayNetworkSource";

describe("subway network source", () => {
	it("loads the generated metropolitan network once as immutable GeoJSON", () => {
		const network = loadSubwayNetwork();

		expect(network.attribution).toContain("OpenStreetMap");
		expect(network.lines.features.length).toBeGreaterThan(1_000);
		expect(network.stations.features.length).toBeGreaterThan(400);
		expect(loadSubwayNetwork()).toBe(network);
		expect(Object.isFrozen(network)).toBe(true);
		expect(Object.isFrozen(network.lines.features)).toBe(true);
		expect(Object.isFrozen(network.lines.features[0]?.geometry.coordinates)).toBe(
			true,
		);
		const firstLine = network.lines.features[0];
		if (!firstLine) throw new Error("Generated subway network has no lines.");
		expect(() => network.lines.features.push(firstLine)).toThrow();
	});

	it("filters stations to the requested bbox without mutating the source", () => {
		const source = loadSubwayNetwork();
		const station = source.stations.features.find(
			(feature) => feature.properties.stationName === "천호",
		);
		expect(station).toBeDefined();
		if (!station) throw new Error("Generated subway network is missing 천호.");
		const [longitude, latitude] = station.geometry.coordinates;

		const filtered = filterSubwayNetwork({
			west: longitude - 0.002,
			south: latitude - 0.002,
			east: longitude + 0.002,
			north: latitude + 0.002,
			zoom: 16,
		});

		expect(
			filtered.stations.features.some(
				(feature) => feature.properties.stationName === "천호",
			),
		).toBe(true);
		expect(filtered.stations.features.length).toBeLessThan(
			source.stations.features.length,
		);
		expect(source.stations.features.length).toBeGreaterThan(400);
		expect(Object.isFrozen(filtered)).toBe(true);
	});

	it("retains a route segment when the bbox crosses between its vertices", () => {
		const source = loadSubwayNetwork();
		const line = source.lines.features.find((feature) => {
			const [left, right] = feature.geometry.coordinates;
			return (
				left !== undefined &&
				right !== undefined &&
				Math.abs(left[0] - right[0]) > 0.00002 &&
				Math.abs(left[1] - right[1]) > 0.00002
			);
		});
		expect(line).toBeDefined();
		if (!line) throw new Error("Generated subway network has no diagonal segment.");
		const [left, right] = line.geometry.coordinates;
		if (!left || !right) throw new Error("Generated line has fewer than two points.");
		const longitude = (left[0] + right[0]) / 2;
		const latitude = (left[1] + right[1]) / 2;
		const longitudeRadius = Math.abs(left[0] - right[0]) / 8;
		const latitudeRadius = Math.abs(left[1] - right[1]) / 8;

		const filtered = filterSubwayNetwork({
			west: longitude - longitudeRadius,
			south: latitude - latitudeRadius,
			east: longitude + longitudeRadius,
			north: latitude + latitudeRadius,
			zoom: 16,
		});

		expect(
			filtered.lines.features.some(
				(feature) => feature.properties.routeId === line.properties.routeId,
			),
		).toBe(true);
	});
});
