import { describe, expect, it, vi } from "vitest";
import {
	fetchBusPositions,
	fetchBusRouteTopology,
	fetchBusRoutesForStop,
	OfficialBusTopologyPort,
} from "./seoulBusPositions";

const ok = { headerCd: "0", headerMsg: "정상적으로 처리되었습니다." };

describe("official Seoul bus map adapter", () => {
	it("normalizes station route membership without exposing the key in the URL contract", async () => {
		const fetcher = vi.fn().mockResolvedValue(
			Response.json({
				msgHeader: ok,
				msgBody: {
					itemList: [
						{ busRouteId: "124100001", busRouteNm: "341", routeType: "3" },
					],
				},
			}),
		);

		await expect(
			fetchBusRoutesForStop(fetcher, "secret-test-key", "25014"),
		).resolves.toEqual([
			{ routeId: "124100001", routeName: "341", color: "#2563eb" },
		]);
		expect(fetcher).toHaveBeenCalledWith(
			expect.stringContaining("/stationinfo/getRouteByStation?"),
			expect.objectContaining({ signal: expect.any(AbortSignal) }),
		);
	});

	it("combines ordered route stations and path coordinates", async () => {
		const fetcher = vi
			.fn()
			.mockResolvedValueOnce(
				Response.json({
					msgHeader: ok,
					msgBody: {
						itemList: [
							{ station: "stop-b", stationNm: "둘", arsId: "25002", seq: "2" },
							{ station: "stop-a", stationNm: "하나", arsId: "25001", seq: "1" },
						],
					},
				}),
			)
			.mockResolvedValueOnce(
				Response.json({
					msgHeader: ok,
					msgBody: {
						itemList: [
							{ gpsX: "127.1100", gpsY: "37.5300", no: "2" },
							{ gpsX: "127.1000", gpsY: "37.5200", no: "1" },
						],
					},
				}),
			);

		const topology = await fetchBusRouteTopology(
			fetcher,
			"secret-test-key",
			{ routeId: "124100001", routeName: "341", color: "#2563eb" },
		);

		expect(topology.stopIds).toEqual(["stop-a", "25001", "stop-b", "25002"]);
		expect(topology.path).toEqual([
			[127.1, 37.52],
			[127.11, 37.53],
		]);
	});

	it("normalizes and bbox-filters live bus GPS", async () => {
		const fetcher = vi.fn().mockResolvedValue(
			Response.json({
				msgHeader: ok,
				msgBody: {
					itemList: [
						{
							vehId: "vehicle-a",
							plainNo: "서울74사1234",
							gpsX: "127.1100",
							gpsY: "37.5300",
							sectOrd: "7",
						},
						{
							vehId: "vehicle-outside",
							plainNo: "서울74사9999",
							gpsX: "127.2000",
							gpsY: "37.6000",
							sectOrd: "8",
						},
					],
				},
			}),
		);

		const result = await fetchBusPositions(
			fetcher,
			"secret-test-key",
			{ routeId: "124100001", routeName: "341" },
			{ west: 127.1, south: 37.52, east: 127.12, north: 37.54 },
			() => Date.parse("2026-09-05T04:00:00.000Z"),
		);

		expect(result.availability).toBe("live");
		expect(result.vehicles).toEqual([
			{
				id: "bus:124100001:vehicle-a",
				mode: "bus",
				routeId: "124100001",
				routeName: "341",
				coordinates: [127.11, 37.53],
				bearing: 0,
				direction: "7번째 구간",
				capturedAt: "2026-09-05T04:00:00.000Z",
				positionBasis: "gps",
			},
		]);
	});

	it("rejects malformed rows", async () => {
		const fetcher = vi.fn().mockResolvedValue(
			Response.json({
				msgHeader: ok,
				msgBody: { itemList: [{ vehId: "", gpsX: "bad", gpsY: "37.53" }] },
			}),
		);

		await expect(
			fetchBusPositions(
				fetcher,
				"secret-test-key",
				{ routeId: "124100001", routeName: "341" },
				{ west: 127.1, south: 37.52, east: 127.12, north: 37.54 },
			),
		).rejects.toThrow();
	});

	it("reports HTTP and timeout failures without leaking the key", async () => {
		const unauthorized = vi.fn().mockResolvedValue(new Response(null, { status: 401 }));
		const timedOut = vi.fn().mockRejectedValue(new DOMException("timed out", "TimeoutError"));

		for (const fetcher of [unauthorized, timedOut]) {
			const error = await fetchBusRoutesForStop(
				fetcher,
				"secret-test-key",
				"25014",
			).catch((caught) => caught);
			expect(error.message).not.toContain("secret-test-key");
			expect(error.detail).not.toContain("secret-test-key");
		}
	});

	it("shares in-flight topology loads and caches them for repeated viewports", async () => {
		const fetcher = vi.fn((input: string | URL | Request) => {
			const url = new URL(String(input));
			if (url.pathname.endsWith("getRouteByStation")) {
				return Promise.resolve(
					Response.json({
						msgHeader: ok,
						msgBody: {
							itemList: [
								{ busRouteId: "124100001", busRouteNm: "341", routeType: "3" },
							],
						},
					}),
				);
			}
			if (url.pathname.endsWith("getStaionByRoute")) {
				return Promise.resolve(
					Response.json({
						msgHeader: ok,
						msgBody: {
							itemList: [
								{ station: "stop-a", stationNm: "하나", arsId: "25001", seq: "1" },
							],
						},
					}),
				);
			}
			return Promise.resolve(
				Response.json({
					msgHeader: ok,
					msgBody: {
						itemList: [
							{ gpsX: "127.1000", gpsY: "37.5200", no: "1" },
							{ gpsX: "127.1100", gpsY: "37.5300", no: "2" },
						],
					},
				}),
			);
		});
		const topology = new OfficialBusTopologyPort(fetcher, "secret-test-key");

		const [first, second] = await Promise.all([
			topology.routesForStops(["25001"]),
			topology.routesForStops(["25001"]),
		]);
		const third = await topology.routesForStops(["25001"]);

		expect(first).toEqual(second);
		expect(second).toEqual(third);
		expect(fetcher).toHaveBeenCalledTimes(3);
		expect(topology.routeSummary("124100001")).toMatchObject({
			routeName: "341",
		});
	});
});
