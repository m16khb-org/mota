import { describe, expect, it, vi } from "vitest";
import { UpstreamError } from "./upstreamError";
import {
	fetchSubwayPositions,
	officialSubwayPositionTemplate,
} from "./subwayPositions";
import { loadSubwayNetwork } from "../transit-map/subwayNetworkSource";

const payload = {
	errorMessage: { status: 200, code: "INFO-000", message: "정상 처리되었습니다." },
	realtimePositionList: [
		{
			subwayId: "1008",
			statnId: "1008000812",
			statnNm: "천호",
			trainNo: "8120",
			recptnDt: "2026-09-05 04:00:00",
			updnLine: "상행",
			trainSttus: "1",
		},
	],
};

describe("subway position adapter", () => {
	it("normalizes official rows into stable station-segment vehicles", async () => {
		const fetcher = vi.fn().mockResolvedValue(Response.json(payload));
		const result = await fetchSubwayPositions(
			fetcher,
			officialSubwayPositionTemplate("secret-test-key"),
			"8호선",
		);

		expect(result).toEqual({
			availability: "live",
			vehicles: [
				{
					id: "subway:1008:8120",
					mode: "subway",
					routeId: "1008",
					routeName: "8호선",
					coordinates: expect.any(Array),
					bearing: 0,
					direction: "상행",
					capturedAt: "2026-09-04T19:00:00.000Z",
					positionBasis: "station-segment",
				},
			],
			capturedAt: "2026-09-04T19:00:00.000Z",
		});
		expect(result.vehicles[0]?.coordinates[0]).toBeGreaterThan(127.1);
		expect(fetcher).toHaveBeenCalledWith(
			expect.stringMatching(/realtimePosition\/0\/100\/8%ED%98%B8%EC%84%A0$/),
			expect.objectContaining({ signal: expect.any(AbortSignal) }),
		);
	});

	it("maps INFO-200 to an expected no-service empty snapshot", async () => {
		const fetcher = vi.fn().mockResolvedValue(
			Response.json({
				errorMessage: {
					status: 200,
					code: "INFO-200",
					message: "해당하는 데이터가 없습니다.",
				},
			}),
		);

		const result = await fetchSubwayPositions(
			fetcher,
			officialSubwayPositionTemplate("secret-test-key"),
			"8호선",
		);

		expect(result.availability).toBe("no-service");
		expect(result.vehicles).toEqual([]);
		expect(new Date(result.capturedAt).toString()).not.toBe("Invalid Date");
	});

	it("skips valid upstream stations outside the generated Seoul map bounds", async () => {
		const fetcher = vi.fn().mockResolvedValue(
			Response.json({
				...payload,
				realtimePositionList: [
					{
						...payload.realtimePositionList[0],
						statnId: "outside",
						statnNm: "소요산",
						trainNo: "outside-train",
					},
					payload.realtimePositionList[0],
				],
			}),
		);

		const result = await fetchSubwayPositions(
			fetcher,
			officialSubwayPositionTemplate("secret-test-key"),
			"8호선",
		);

		expect(result.availability).toBe("live");
		expect(result.vehicles).toHaveLength(1);
		expect(result.vehicles[0]?.id).toBe("subway:1008:8120");
	});

	it("uses the matching line when different stations share a name", async () => {
		const fetcher = vi.fn().mockResolvedValue(
			Response.json({
				...payload,
				realtimePositionList: [
					{ ...payload.realtimePositionList[0], statnNm: "대림" },
				],
			}),
		);
		const expected = loadSubwayNetwork().stations.features.find(
			(feature) =>
				normalizeStationName(feature.properties.stationName) === "대림" &&
				feature.properties.routeIds.includes("2"),
		);
		if (!expected) throw new Error("Generated network is missing 2호선 대림.");

		const result = await fetchSubwayPositions(
			fetcher,
			officialSubwayPositionTemplate("secret-test-key"),
			"2호선",
		);

		expect(result.vehicles[0]?.coordinates).toEqual(expected.geometry.coordinates);
	});

	it("rejects malformed official rows", async () => {
		const fetcher = vi.fn().mockResolvedValue(
			Response.json({
				...payload,
				realtimePositionList: [{ ...payload.realtimePositionList[0], trainNo: "" }],
			}),
		);

		await expect(
			fetchSubwayPositions(
				fetcher,
				officialSubwayPositionTemplate("secret-test-key"),
				"8호선",
			),
		).rejects.toThrow();
	});

	it("reports the line and status without exposing the credential", async () => {
		const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 401 }));

		const error = await fetchSubwayPositions(
			fetcher,
			officialSubwayPositionTemplate("secret-test-key"),
			"8호선",
		).catch((caught) => caught);

		expect(error).toBeInstanceOf(UpstreamError);
		expect(error.detail).toContain("8호선");
		expect(error.detail).toContain("401");
		expect(error.detail).not.toContain("secret-test-key");
	});
});

function normalizeStationName(value: string) {
	return value.replace(/\([^)]*\)/g, "").replace(/역$/, "").replace(/\s+/g, "").trim();
}
