import { describe, expect, it, vi } from "vitest";
import { transitMapNetworkSchema } from "@mota/contracts/transit-map";
import { createApp } from "./create-test-app";

const subwayArrivalUpstreamPayload = {
	errorMessage: { code: "INFO-000", message: "정상 처리되었습니다." },
	realtimeArrivalList: [
		{
			subwayId: "1002",
			updnLine: "하행",
			trainLineNm: "강남방면",
			btrainSttus: "일반",
			barvlDt: "45",
			arvlMsg2: "전역 출발",
			arvlMsg3: "을지로",
			lstcarAt: "0",
			recptnDt: "2026-08-20 12:10:20",
		},
	],
};

const OFFICIAL_SUBWAY_CATALOG_URL =
	"https://t-data.seoul.go.kr/dataprovide/download.do?id=10229";

const TRANSIT_MAP_QUERY =
	"west=127.10&south=37.52&east=127.12&north=37.54&zoom=16";

describe("transit map network API", () => {
	it("returns a schema-valid static network for a valid viewport", async () => {
		const response = await createApp(vi.fn()).request(
			`/api/transit-map/network?${TRANSIT_MAP_QUERY}`,
		);
		const payload = await response.json();

		expect(response.status, JSON.stringify(payload)).toBe(200);
		expect(transitMapNetworkSchema.safeParse(payload).success).toBe(true);
		expect(payload.bus).toMatchObject({
			enabled: false,
			reason: "unconfigured",
		});
		expect(response.headers.get("cache-control")).toBe("public, max-age=300");
		expect(response.headers.get("etag")).toMatch(/^".+"$/);
	});

	it("rejects reversed and outside-Seoul bounds", async () => {
		const app = createApp(vi.fn());
		const reversed = await app.request(
			"/api/transit-map/network?west=127.12&south=37.52&east=127.10&north=37.54&zoom=16",
		);
		const outside = await app.request(
			"/api/transit-map/network?west=128.10&south=37.52&east=128.12&north=37.54&zoom=16",
		);

		expect(reversed.status).toBe(400);
		expect(outside.status).toBe(400);
	});

	it("returns 304 when the network revision matches If-None-Match", async () => {
		const app = createApp(vi.fn());
		const first = await app.request(
			`/api/transit-map/network?${TRANSIT_MAP_QUERY}`,
		);
		const etag = first.headers.get("etag");
		expect(etag).not.toBeNull();
		if (!etag) throw new Error("Transit map response did not include an ETag.");

		const second = await app.request(
			`/api/transit-map/network?${TRANSIT_MAP_QUERY}`,
			{ headers: { "if-none-match": etag } },
		);

		expect(second.status).toBe(304);
	});
});

type MockSubwayElement = {
	readonly type?: string;
	readonly id: number;
	readonly lat: number;
	readonly lon: number;
	readonly tags: {
		readonly name: string;
		readonly network?: string;
	};
};

function subwayCatalogResponse(input: {
	readonly elements: readonly MockSubwayElement[];
}) {
	const header =
		"외구간_역_수,역한글명칭,호선명칭,환승역X좌표,환승역Y좌표";
	const rows = input.elements.map(
		(element) =>
			`${element.id},${element.tags.name},${element.tags.name === "시청" ? "1호선" : "8호선"
			},${element.lon},${element.lat}`,
	);
	return new Response([header, ...rows].join("\n"));
}

describe("bus API adapter", () => {
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
		expect(await before.json()).toMatchObject({
			status: "ok",
			liveTransit: {
				subway: { status: "unavailable", successCount: 0, failureCount: 0 },
				bus: { status: "unconfigured", successCount: 0, failureCount: 0 },
			},
			transitCatalogs: {
				bus: { ready: false, count: 0 },
				subway: { ready: false, count: 0 },
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
				subway: { ready: false, count: 0 },
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

	it("adds nearby subway stations as route points", async () => {
		const upstream = vi.fn().mockImplementation(() =>
			Promise.resolve(
				subwayCatalogResponse({
					elements: [
						{
							type: "node",
							id: 5801572034,
							lat: 37.5385225,
							lon: 127.1234021,
							tags: {
								name: "천호",
								network: "수도권 전철",
							},
						},
					],
				}),
			),
		);
		const response = await createApp(upstream).request(
			"/api/subway/nearby?lat=37.5366&lng=127.1253&radius=3000",
		);

		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({
			stations: [
				{
					id: "seoul-5801572034",
					name: "천호",
					line: "8호선",
					lat: 37.5385225,
					lng: 127.1234021,
				},
			],
		});
		expect(upstream).toHaveBeenCalledWith(
			OFFICIAL_SUBWAY_CATALOG_URL,
			expect.objectContaining({
				signal: expect.any(AbortSignal),
			}),
		);
	});

	it("serves different subway searches from one complete cached catalog", async () => {
		const upstream = vi.fn().mockImplementation(() =>
			Promise.resolve(
				subwayCatalogResponse({
					elements: [
						{
							type: "node",
							id: 5801572034,
							lat: 37.5385225,
							lon: 127.1234021,
							tags: { name: "천호", network: "수도권 전철" },
						},
						{
							type: "node",
							id: 5487399505,
							lat: 37.565715,
							lon: 126.977088,
							tags: { name: "시청", network: "수도권 전철" },
						},
					],
				}),
			),
		);
		const app = createApp(upstream);

		const cheonho = await app.request(
			"/api/subway/nearby?lat=37.5366&lng=127.1253&radius=3000",
		);
		const cityHall = await app.request(
			"/api/subway/nearby?lat=37.5665&lng=126.978&radius=3000",
		);

		expect(cheonho.status).toBe(200);
		expect(cityHall.status).toBe(200);
		expect(await cheonho.json()).toMatchObject({
			stations: [{ name: "천호" }],
		});
		expect(await cityHall.json()).toMatchObject({
			stations: [{ name: "시청" }],
		});
		expect(upstream).toHaveBeenCalledTimes(1);
		expect(upstream).toHaveBeenCalledWith(
			OFFICIAL_SUBWAY_CATALOG_URL,
			expect.objectContaining({
				signal: expect.any(AbortSignal),
			}),
		);
	});

	it("rejects coordinates outside the Seoul service boundary", async () => {
		const upstream = vi.fn();
		const response = await createApp(upstream).request(
			"/api/stops/nearby?lat=35.1796&lng=129.0756&radius=800",
		);

		expect(response.status).toBe(400);
		expect(upstream).not.toHaveBeenCalled();
	});

	it("serves repeated subway searches from the cached official catalog", async () => {
		const upstream = vi.fn().mockResolvedValue(
			subwayCatalogResponse({
				elements: [
					{
						type: "node",
						id: 5801572034,
						lat: 37.5385225,
						lon: 127.1234021,
						tags: { name: "천호", network: "수도권 전철" },
					},
				],
			}),
		);
		const app = createApp(upstream);
		const url = "/api/subway/nearby?lat=37.5366&lng=127.1253&radius=3000";

		const first = await app.request(url);
		const second = await app.request(url);

		expect(first.status).toBe(200);
		expect(second.status).toBe(200);
		expect(upstream).toHaveBeenCalledTimes(1);
		expect(await second.json()).toMatchObject({
			stations: [{ name: "천호" }],
		});
	});

	it("keeps valid official stations when one CSV row is malformed", async () => {
		const upstream = vi.fn().mockResolvedValue(
			new Response(
				[
					"외구간_역_수,역한글명칭,호선명칭,환승역X좌표,환승역Y좌표",
					"2812,천호,8호선,127.1234021,37.5385225",
					"invalid,row",
				].join("\n"),
			),
		);
		const response = await createApp(upstream).request(
			"/api/subway/nearby?lat=37.5366&lng=127.1253&radius=3000",
		);

		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({
			stations: [{ name: "천호" }],
		});
		expect(upstream).toHaveBeenCalledTimes(1);
	});

	it("shares one pending official catalog load across nearby requests", async () => {
		let release: ((response: Response) => void) | undefined;
		let requestStarted: (() => void) | undefined;
		const started = new Promise<void>((resolve) => {
			requestStarted = resolve;
		});
		const upstream = vi.fn(
			() =>
				new Promise<Response>((resolve) => {
					release = resolve;
					requestStarted?.();
				}),
		);
		const app = createApp(upstream);
		const firstResponse = app.request(
			"/api/subway/nearby?lat=37.5366&lng=127.1253&radius=3000",
		);
		const secondResponse = app.request(
			"/api/subway/nearby?lat=37.5665&lng=126.978&radius=3000",
		);

		await started;
		expect(upstream).toHaveBeenCalledTimes(1);
		release?.(
			subwayCatalogResponse({
				elements: [
					{
						type: "node",
						id: 5801572035,
						lat: 37.5385225,
						lon: 127.1234021,
						tags: { name: "송파", network: "수도권 전철" },
					},
				],
			}),
		);
		const [first, second] = await Promise.all([firstResponse, secondResponse]);

		expect(first.status).toBe(200);
		expect(second.status).toBe(200);
		expect(await first.json()).toMatchObject({
			stations: [{ name: "송파" }],
		});
		expect(upstream).toHaveBeenCalledTimes(1);
	});

	it("loads the station catalog from the official Seoul source", async () => {
		const upstream = vi.fn().mockResolvedValue(
			subwayCatalogResponse({
				elements: [
					{
						type: "node",
						id: 5801572034,
						lat: 37.5385225,
						lon: 127.1234021,
						tags: { name: "천호", network: "수도권 전철" },
					},
				],
			}),
		);
		const response = await createApp(upstream).request(
			"/api/subway/nearby?lat=37.5366&lng=127.1253&radius=3000",
		);

		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({
			stations: [{ name: "천호" }],
		});
		expect(upstream).toHaveBeenCalledTimes(1);
		expect(upstream).toHaveBeenCalledWith(
			OFFICIAL_SUBWAY_CATALOG_URL,
			expect.objectContaining({ signal: expect.any(AbortSignal) }),
		);
	});

	it("keeps observable display identity through the Nest JSON boundary", async () => {
		const upstream = vi.fn().mockResolvedValue(
			Response.json({
				errorMessage: {
					status: 200,
					code: "INFO-000",
					message: "정상 처리되었습니다.",
				},
				realtimeArrivalList: [
					{
						subwayId: "1002",
						updnLine: "하행",
						trainLineNm: "강남방면",
						btrainSttus: "일반",
						barvlDt: "45",
						arvlMsg2: "전역 출발",
						arvlMsg3: "을지로",
						lstcarAt: "0",
						recptnDt: "2026-08-20 12:10:20",
					},
				],
			}),
		);
		const response = await createApp(upstream, {
			subwayArrivalUpstream: "https://subway-arrival.test",
		}).request("/api/subway/arrivals?station=%EC%B2%9C%ED%98%B8");

		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({
			arrivals: [{ line: "2호선", direction: "강남방면" }],
		});
	});

	it("normalizes realtime subway arrivals for a saved station", async () => {
		const upstream = vi.fn().mockResolvedValue(
			Response.json({
				errorMessage: {
					status: 200,
					code: "INFO-000",
					message: "정상 처리되었습니다.",
				},
				realtimeArrivalList: [
					{
						subwayId: "1002",
						updnLine: "하행",
						trainLineNm: "강남방면",
						btrainSttus: "일반",
						barvlDt: "45",
						arvlMsg2: "전역 출발",
						arvlMsg3: "을지로",
						lstcarAt: "0",
						recptnDt: "2026-08-20 12:10:20",
					},
				],
			}),
		);
		const response = await createApp(upstream, {
			subwayArrivalUpstream: "https://subway-arrival.test",
		}).request("/api/subway/arrivals?station=%EC%B2%9C%ED%98%B8");

		const body = (await response.json()) as { updatedAt: string; arrivals: unknown[] };
		expect(response.status).toBe(200);
		expect(body).toMatchObject({
			arrivals: [{ line: "2호선", seconds: 45 }],
		});
		expect(body.updatedAt).toBe("2026-08-20T03:10:20.000Z");
		expect(upstream).toHaveBeenCalledWith(
			"https://subway-arrival.test/v1/seoul-subway/arrival?station=%EC%B2%9C%ED%98%B8%28%ED%92%8D%EB%82%A9%ED%86%A0%EC%84%B1%29",
			expect.objectContaining({ signal: expect.any(AbortSignal) }),
		);
	});

	it("uses the official Seoul API when an API key is configured", async () => {
		const upstream = vi.fn().mockResolvedValue(
			Response.json(subwayArrivalUpstreamPayload),
		);
		const response = await createApp(upstream, {
			subwayArrivalUpstream:
				"http://swopenAPI.seoul.go.kr/api/subway/official-test-key/json/realtimeStationArrival/0/100/{station}",
		}).request("/api/subway/arrivals?station=%EC%84%9C%EC%9A%B8%EC%97%AD");

		expect(response.status).toBe(200);
		expect(upstream).toHaveBeenCalledWith(
			"http://swopenapi.seoul.go.kr/api/subway/official-test-key/json/realtimeStationArrival/0/100/%EC%84%9C%EC%9A%B8",
			expect.objectContaining({ signal: expect.any(AbortSignal) }),
		);
	});

	it("propagates stable subway service and direction keys through the Nest JSON boundary", async () => {
		const upstream = vi.fn().mockResolvedValue(
			Response.json(subwayArrivalUpstreamPayload),
		);
		const response = await createApp(upstream, {
			subwayArrivalUpstream: "https://subway-arrival.test",
		}).request("/api/subway/arrivals?station=%EC%B2%9C%ED%98%B8");

		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({
			arrivals: [
				{
					subwayId: "1002",
					updnLine: "하행",
					trainLineNm: "강남방면",
					line: "2호선",
					direction: "강남방면",
				},
			],
		});
	});

	it("fails the boundary when an upstream row lacks the stable updnLine key", async () => {
		const upstream = vi.fn().mockResolvedValue(
			Response.json({
				errorMessage: { code: "INFO-000", message: "정상 처리되었습니다." },
				realtimeArrivalList: [
					{
						subwayId: "1002",
						trainLineNm: "강남방면",
						barvlDt: "45",
						recptnDt: "2026-08-20 12:10:20",
					},
				],
			}),
		);
		const response = await createApp(upstream, {
			subwayArrivalUpstream: "https://subway-arrival.test",
		}).request("/api/subway/arrivals?station=%EC%B2%9C%ED%98%B8");

		expect(response.status).toBe(502);
		expect(await response.json()).toMatchObject({
			error: "UPSTREAM_UNAVAILABLE",
		});
	});

	it("reports upstream failure for subway arrivals", async () => {
		const upstream = vi.fn().mockRejectedValue(new Error("proxy down"));
		const response = await createApp(upstream, {
			subwayArrivalUpstream: "https://subway-arrival.test",
		}).request("/api/subway/arrivals?station=%EC%B2%9C%ED%98%B8");

		expect(response.status).toBe(502);
		expect(await response.json()).toMatchObject({
			error: "UPSTREAM_UNAVAILABLE",
		});
	});

	it("rejects subway arrival lookups without a station", async () => {
		const upstream = vi.fn();
		const response = await createApp(upstream, {
			subwayArrivalUpstream: "https://subway-arrival.test",
		}).request("/api/subway/arrivals?station=%20");

		expect(response.status).toBe(400);
		expect(await response.json()).toMatchObject({ error: "INVALID_STATION" });
		expect(upstream).not.toHaveBeenCalled();
	});

	it("serves stale cached stations when the official source fails", async () => {
		let now = 1_000_000;
		const upstream = vi
			.fn()
			.mockResolvedValueOnce(
				subwayCatalogResponse({
					elements: [
						{
							type: "node",
							id: 5801572034,
							lat: 37.5385225,
							lon: 127.1234021,
							tags: { name: "천호", network: "수도권 전철" },
						},
					],
				}),
			)
			.mockRejectedValue(new Error("official catalog down"));
		const app = createApp(upstream, { now: () => now });
		const url = "/api/subway/nearby?lat=37.5366&lng=127.1253&radius=3000";

		const first = await app.request(url);
		now += 25 * 60 * 60 * 1_000;
		const second = await app.request(url);

		expect(first.status).toBe(200);
		expect(second.status).toBe(200);
		expect(await second.json()).toMatchObject({
			stations: [{ name: "천호" }],
		});
	});

	it("reports upstream failure when no cached stations exist", async () => {
		const upstream = vi
			.fn()
			.mockRejectedValue(new Error("official catalog down"));
		const response = await createApp(upstream, {
			now: () => 0,
		}).request("/api/subway/nearby?lat=37.5366&lng=127.1253&radius=3000");

		expect(response.status).toBe(502);
		expect(await response.json()).toMatchObject({
			error: "UPSTREAM_UNAVAILABLE",
		});
	});
});
