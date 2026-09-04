import { describe, expect, it } from "vitest";
import { mapPreviewPoints } from "./mapPreviewPoints";
import type { BusStop } from "../../domain/bus";
import type { SubwayStation } from "../../domain/subway";

const bus = (id: string, lng = 127, lat = 37): BusStop => ({ id: id as BusStop["id"], arsId: "12345" as BusStop["arsId"], name: `Bus ${id}`, lng, lat, distanceMeters: 10 });
const station = (id: string, lng = 128, lat = 38): SubwayStation => ({ id: id as SubwayStation["id"], name: `Station ${id}`, line: "2호선", lng, lat, distanceMeters: 20 });

describe("mapPreviewPoints", () => {
	it("maps records in caller order with stable keys and [lng, lat]", () => {
		const b = bus("same", 1, 2); const s = station("same", 3, 4);
		expect(mapPreviewPoints([b], [s])).toMatchObject([{ key: "bus:same", coordinates: [1, 2], mode: "bus", name: "Bus same", detail: "12345", distance: 10, accessibleName: "버스 Bus same", entity: b }, { key: "subway:same", coordinates: [3, 4], mode: "subway", detail: "2호선", distance: 20, entity: s }]);
	});
	it("preserves empty input and first duplicate without mutation", () => {
		const first = bus("x", 1, 2); const second = bus("x", 9, 9); const input = [first, second] as const;
		const snapshot = structuredClone(input);
		expect(mapPreviewPoints([], [])).toEqual([]);
		expect(mapPreviewPoints(input, [station("x")])).toMatchObject([
			{ key: "bus:x", entity: first },
			{ key: "bus:x#2", entity: second },
			{ key: "subway:x", accessibleName: "지하철 Station x" },
		]);
		expect(mapPreviewPoints(input, [])[0]?.entity).toBe(first);
		expect(input).toEqual(snapshot);
	});
	it("preserves duplicate rows with deterministic suffixed keys", () => {
		const first = bus("x", 1, 2);
		const second = bus("x", 9, 8);
		const third = bus("x", 7, 6);

		expect(mapPreviewPoints([first, second, third], [])).toMatchObject([
			{ key: "bus:x", coordinates: [1, 2], entity: first },
			{ key: "bus:x#2", coordinates: [9, 8], entity: second },
			{ key: "bus:x#3", coordinates: [7, 6], entity: third },
		]);
	});
	it("avoids collisions between generated suffixes and raw IDs", () => {
		const suffixedId = bus("x#2", 1, 2);
		const first = bus("x", 3, 4);
		const duplicate = bus("x", 5, 6);

		expect(mapPreviewPoints([suffixedId, first, duplicate], []).map((point) => point.key)).toEqual([
			"bus:x#2",
			"bus:x",
			"bus:x#3",
		]);
	});
	it("handles 100 buses + 30 stations with unique keys", () => {
		const points = mapPreviewPoints(Array.from({ length: 100 }, (_, i) => bus(String(i), i, i)), Array.from({ length: 30 }, (_, i) => station(String(i), -i, i)));
		expect({ count: points.length, uniqueKeys: new Set(points.map(p => p.key)).size, first: points[0]?.coordinates, last: points.at(-1)?.coordinates }).toEqual({ count: 130, uniqueKeys: 130, first: [0, 0], last: [-29, 29] });
	});
});
