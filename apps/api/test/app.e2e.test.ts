import { describe, expect, it, vi } from "vitest";
import { createApp } from "./create-test-app";

describe("bus API adapter", () => {
	it("keeps normal bus stop and arrival endpoints available", async () => {
		const upstream = vi
			.fn()
			.mockResolvedValueOnce(
				Response.json({
					ResponseVO: {
						data: {
							resultList: [
								{
									strid: 124000454,
									strnm: "천호역",
									strno: "25014",
									diffMeter: 151,
									posX: 127.1255385876,
									posY: 37.5379482005,
								},
							],
						},
					},
				}),
			)
			.mockResolvedValueOnce(
				Response.json({
					error: { errorMessage: "성공", errorCode: "0000" },
					resultList: [],
				}),
			);
		const app = createApp(upstream);

		const stops = await app.request(
			"/api/stops/nearby?lat=37.5366&lng=127.1253&radius=800",
		);
		const arrivals = await app.request("/api/arrivals/25014");

		expect(stops.status).toBe(200);
		expect(arrivals.status).toBe(200);
		expect(await stops.json()).toMatchObject({ stops: [{ arsId: "25014" }] });
		expect(await arrivals.json()).toMatchObject({ arrivals: [] });
	});

	it("normalizes nearby stops from the official Seoul transit response", async () => {
		const upstream = vi.fn().mockImplementation(() =>
			Promise.resolve(Response.json({
				ResponseVO: {
					data: {
						resultList: [
							{
								strid: 124000454,
								strnm: "천호역",
								strno: "25014",
								diffMeter: 151,
								posX: 127.1255385876,
								posY: 37.5379482005,
							},
						],
					},
				},
			})),
		);
		const response = await createApp(upstream).request(
			"/api/stops/nearby?lat=37.5366&lng=127.1253&radius=800",
		);
		const payload = await response.json();

		expect(response.status, JSON.stringify(payload)).toBe(200);
		expect(payload).toMatchObject({
			stops: [{ name: "천호역", arsId: "25014" }],
		});
		expect(upstream).toHaveBeenCalledWith(
			expect.stringContaining("selectNearStops.do?kiloMeter=45"),
			expect.objectContaining({ signal: expect.any(AbortSignal) }),
		);
	});

	it("serves different stop searches from one complete cached catalog", async () => {
		const upstream = vi.fn().mockImplementation(() =>
			Promise.resolve(
				Response.json({
					ResponseVO: {
						data: {
							resultList: [
								{
									strid: 124000454,
									strnm: "천호역",
									strno: "25014",
									diffMeter: 151,
									posX: 127.1255385876,
									posY: 37.5379482005,
								},
								{
									strid: 101000227,
									strnm: "시청.덕수궁",
									strno: "02662",
									diffMeter: 99,
									posX: 126.976921,
									posY: 37.566254,
								},
							],
						},
					},
				}),
			),
		);
		const app = createApp(upstream);

		const cheonho = await app.request(
			"/api/stops/nearby?lat=37.5366&lng=127.1253&radius=800",
		);
		const cityHall = await app.request(
			"/api/stops/nearby?lat=37.5665&lng=126.978&radius=800",
		);

		expect(cheonho.status).toBe(200);
		expect(cityHall.status).toBe(200);
		expect(await cheonho.json()).toMatchObject({
			stops: [{ name: "천호역" }],
		});
		expect(await cityHall.json()).toMatchObject({
			stops: [{ name: "시청.덕수궁" }],
		});
		expect(upstream).toHaveBeenCalledTimes(1);
		expect(upstream).toHaveBeenCalledWith(
			expect.stringContaining("kiloMeter=45"),
			expect.objectContaining({ signal: expect.any(AbortSignal) }),
		);
	});

	it("keeps valid catalog stops when one upstream row is malformed", async () => {
		const upstream = vi.fn().mockResolvedValue(
			Response.json({
				ResponseVO: {
					data: {
						resultList: [
							{
								strid: 124000454,
								strnm: "천호역",
								strno: "25014",
								diffMeter: 151,
								posX: 127.1255385876,
								posY: 37.5379482005,
							},
							{
								strid: 999999999,
								strnm: "ARS 없음",
								strno: "-",
								diffMeter: 170,
								posX: 127.1256,
								posY: 37.538,
							},
						],
					},
				},
			}),
		);

		const response = await createApp(upstream).request(
			"/api/stops/nearby?lat=37.5366&lng=127.1253&radius=800",
		);

		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({
			stops: [{ name: "천호역" }],
		});
	});

	it("exposes non-gating catalog readiness through health", async () => {
		const upstream = vi.fn().mockImplementation(() =>
			Promise.resolve(
				Response.json({
					ResponseVO: {
						data: {
							resultList: [
								{
									strid: 124000454,
									strnm: "천호역",
									strno: "25014",
									diffMeter: 151,
									posX: 127.1255385876,
									posY: 37.5379482005,
								},
							],
						},
					},
				}),
			),
		);
		const app = createApp(upstream);

		const before = await app.request("/api/health");
		expect(before.status).toBe(200);
		const beforeBody = await before.json();
		expect(beforeBody).not.toHaveProperty("liveTransit");
		expect(beforeBody).not.toHaveProperty("transitCatalogs.subway");
		expect(beforeBody).toMatchObject({
			status: "ok",
			transitCatalogs: {
				bus: { ready: false, count: 0 },
			},
		});

		await app.request(
			"/api/stops/nearby?lat=37.5366&lng=127.1253&radius=800",
		);
		const after = await app.request("/api/health");
		expect(after.status).toBe(200);
		expect(await after.json()).toMatchObject({
			transitCatalogs: {
				bus: { ready: true, count: 1 },
			},
		});
	});

	it("normalizes and sorts live arrivals from the Hermes BIS source", async () => {
		const upstream = vi.fn().mockResolvedValue(
			Response.json({
				error: { errorMessage: "성공", errorCode: "0000" },
				resultList: [
					{
						busRouteId: "124900001",
						rtNm: "강동05",
						adirection: "강동공영차고지",
						arrmsg1: "8분1초후[3번째 전]",
						arrmsg2: "23분6초후[15번째 전]",
						arrmsgSec1: "481",
						arrmsgSec2: "1386",
						sectOrd1: "3",
						sectOrd2: "15",
						routeType: "2",
						busType1: "1",
						congetion1: "3",
					},
				],
			}),
		);
		const response = await createApp(upstream).request("/api/arrivals/25162");

		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({
			arrivals: [
				{
					routeName: "강동05",
					first: { seconds: 481, congestion: "여유" },
				},
			],
		});
		expect(upstream).toHaveBeenCalledWith(
			"http://m.bus.go.kr/mBus/bus/getStationByUid.bms",
			expect.objectContaining({
				method: "POST",
				body: "arsId=25162",
			}),
		);
	});

	it("keeps bus arrival lookups realtime instead of catalog-caching them", async () => {
		const upstream = vi.fn().mockImplementation(() =>
			Promise.resolve(
				Response.json({
					error: { errorMessage: "성공", errorCode: "0000" },
					resultList: [],
				}),
			),
		);
		const app = createApp(upstream);

		expect((await app.request("/api/arrivals/25162")).status).toBe(200);
		expect((await app.request("/api/arrivals/25162")).status).toBe(200);
		expect(upstream).toHaveBeenCalledTimes(2);
	});

	it("rejects coordinates outside the Seoul service boundary", async () => {
		const upstream = vi.fn();
		const response = await createApp(upstream).request(
			"/api/stops/nearby?lat=35.1796&lng=129.0756&radius=800",
		);

		expect(response.status).toBe(400);
		expect(upstream).not.toHaveBeenCalled();
	});

});
