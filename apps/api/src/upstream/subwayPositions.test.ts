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

const olderMappedObservation = {
	...payload.realtimePositionList[0],
	subwayId: "1001",
	statnId: "1001000127",
	statnNm: "동묘앞",
	trainNo: "0098",
	recptnDt: "2026-09-05 04:00:00",
};
const newerUnmappedObservation = {
	...olderMappedObservation,
	statnId: "1001000139",
	statnNm: "소요산",
	recptnDt: "2026-09-05 04:01:00",
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

	it("normalizes official numeric direction codes without losing provider semantics", async () => {
		const fetcher = vi.fn().mockResolvedValue(
			Response.json({
				...payload,
				realtimePositionList: [
					{ ...payload.realtimePositionList[0], updnLine: "0" },
					{
						...payload.realtimePositionList[0],
						trainNo: "8121",
						statnNm: "잠실",
						updnLine: "1",
					},
				],
			}),
		);

		const result = await fetchSubwayPositions(
			fetcher,
			officialSubwayPositionTemplate("secret-test-key"),
			"8호선",
		);

		expect(result.vehicles.map((vehicle) => vehicle.direction)).toEqual([
			"상행/내선",
			"하행/외선",
		]);
	});

	it("keeps only the newest observation when the upstream repeats a train number", async () => {
		const fetcher = vi.fn().mockResolvedValue(
			Response.json({
				...payload,
				realtimePositionList: [
					{ ...payload.realtimePositionList[0], recptnDt: "2026-09-05 04:00:00" },
					{
						...payload.realtimePositionList[0],
						statnNm: "잠실",
						recptnDt: "2026-09-05 03:59:00",
					},
				],
			}),
		);

		const expected = loadSubwayNetwork().stations.features.find(
			(feature) =>
				normalizeStationName(feature.properties.stationName) === "천호" &&
				feature.properties.routeIds.includes("8"),
		);
		if (!expected) throw new Error("Generated network is missing 8호선 천호.");

		const result = await fetchSubwayPositions(
			fetcher,
			officialSubwayPositionTemplate("secret-test-key"),
			"8호선",
		);

		expect(result.vehicles).toHaveLength(1);
		expect(result.vehicles[0]).toMatchObject({
			coordinates: expected.geometry.coordinates,
			capturedAt: "2026-09-04T19:00:00.000Z",
		});
	});

	it("omits a same-name station without an exact line anchor", async () => {
		const fetcher = vi.fn().mockResolvedValue(
			Response.json({
				...payload,
				realtimePositionList: [
					{
						...payload.realtimePositionList[0],
						subwayId: "1063",
						statnId: "1063075135",
						statnNm: "양평",
						trainNo: "5075",
						updnLine: "1",
					},
				],
			}),
		);

		const result = await fetchSubwayPositions(
			fetcher,
			officialSubwayPositionTemplate("secret-test-key"),
			"경의중앙선",
		);

		expect(result).toMatchObject({
			availability: "no-service",
			vehicles: [],
		});
	});

	it.each([
		{
			label: "older mapped row before newer unmapped row",
			rows: [olderMappedObservation, newerUnmappedObservation],
		},
		{
			label: "newer unmapped row before older mapped row",
			rows: [newerUnmappedObservation, olderMappedObservation],
		},
	])("omits a train when its newest row is unmapped ($label)", async ({ rows }) => {
		const fetcher = vi.fn().mockResolvedValue(
			Response.json({ ...payload, realtimePositionList: rows }),
		);

		const result = await fetchSubwayPositions(
			fetcher,
			officialSubwayPositionTemplate("secret-test-key"),
			"1호선",
		);

		expect(result).toMatchObject({
			availability: "no-service",
			vehicles: [],
		});
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

	it("normalizes the official top-level quota error without exposing the credential", async () => {
		const fetcher = vi.fn().mockResolvedValue(
			Response.json({
				status: 500,
				code: "ERROR-337",
				message: "데이터요청은 일일 호출건수 최대 1000건을 넘을 수 없습니다.",
				link: "",
				developerMessage: "",
				total: 0,
			}),
		);

		const error = await fetchSubwayPositions(
			fetcher,
			officialSubwayPositionTemplate("secret-test-key"),
			"8호선",
		).catch((caught) => caught);

		expect(error).toBeInstanceOf(UpstreamError);
		expect(error.detail).toContain("8호선");
		expect(error.detail).toContain("500");
		expect(error.detail).toContain("ERROR-337");
		expect(error.detail).toContain("1000");
		expect(error.detail).not.toContain("secret-test-key");
	});

	it("normalizes a non-2xx quota envelope before generic status handling", async () => {
		const fetcher = vi.fn().mockResolvedValue(
			new Response(
				JSON.stringify({
					status: 500,
					code: "ERROR-337",
					message: "daily quota",
				}),
				{
					status: 500,
					headers: { "content-type": "application/json" },
				},
			),
		);

		const error = await fetchSubwayPositions(
			fetcher,
			officialSubwayPositionTemplate("secret-test-key"),
			"8호선",
		).catch((caught) => caught);

		expect(error).toBeInstanceOf(UpstreamError);
		expect(error.detail).toContain("ERROR-337");
		expect(error.detail).toContain("daily quota");
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
