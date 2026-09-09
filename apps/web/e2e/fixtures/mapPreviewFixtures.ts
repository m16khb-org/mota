import type { Page, Route } from "@playwright/test";
import type {
	SubwayVehicle,
	TransitAvailability,
	TransitMapNetwork,
} from "@mota/contracts/transit-map";

export const previewStyleUrl = "https://tiles.openfreemap.org/styles/liberty";

const subwayRoute = {
	type: "Feature" as const,
	properties: { routeId: "8", routeName: "8호선", color: "#e6186c" },
	geometry: {
		type: "LineString" as const,
		coordinates: [
			[127.118, 37.532] as [number, number],
			[127.123, 37.538] as [number, number],
			[127.13, 37.542] as [number, number],
		],
	},
};

export const subwayStation = {
	type: "Feature" as const,
	properties: {
		stationId: "8120",
		stationName: "천호역 (풍납토성)",
		routeIds: ["5호선", "8호선"],
	},
	geometry: {
		type: "Point" as const,
		coordinates: [127.123, 37.538] as [number, number],
	},
};

export const firstTrain: SubwayVehicle = {
	id: "subway:8:8120",
	mode: "subway",
	routeId: "8",
	routeName: "8호선",
	coordinates: [127.124, 37.539],
	bearing: 35,
	direction: "암사행 · 역 구간 기준 실시간 위치",
	capturedAt: "2026-09-05T04:20:00.000Z",
	positionBasis: "station-segment",
};

export const movedTrain: SubwayVehicle = {
	...firstTrain,
	coordinates: [127.126, 37.54],
	bearing: 48,
	capturedAt: "2026-09-05T04:20:10.000Z",
};

export function networkForZoom(_zoom: number): TransitMapNetwork {
	return {
		revision: "fixture-subway",
		generatedAt: "2026-09-05T04:20:00.000Z",
		subway: {
			attribution: "© OpenStreetMap contributors, ODbL",
			lines: { type: "FeatureCollection", features: [subwayRoute] },
			stations: { type: "FeatureCollection", features: [subwayStation] },
		},
	};
}

export const localBuildingStyle = {
	version: 8 as const,
	name: "Mota deterministic building fixture",
	sources: {
		openmaptiles: {
			type: "geojson" as const,
			attribution:
				'<a href="https://openfreemap.org/">OpenFreeMap</a> · <a href="https://openmaptiles.org/">OpenMapTiles</a> · <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
			data: {
				type: "FeatureCollection" as const,
				features: [
					{
						type: "Feature" as const,
						properties: { height: 48, minHeight: 0 },
						geometry: {
							type: "Polygon" as const,
							coordinates: [
								[
									[127.1247, 37.5362],
									[127.1259, 37.5362],
									[127.1259, 37.537],
									[127.1247, 37.537],
									[127.1247, 37.5362],
								],
							],
						},
					},
				],
			},
		},
	},
	layers: [
		{
			id: "background",
			type: "background" as const,
			paint: { "background-color": "#f3f3ec" },
		},
		{
			id: "building-3d",
			type: "fill-extrusion" as const,
			source: "openmaptiles",
			paint: {
				"fill-extrusion-color": "#a7a7a0",
				"fill-extrusion-height": ["get", "height"],
				"fill-extrusion-base": ["get", "minHeight"],
				"fill-extrusion-opacity": 0.88,
			},
		},
	],
};

export interface NetworkAudit {
	readonly consoleErrors: string[];
	readonly pageErrors: string[];
	readonly requestFailures: string[];
}

export interface PreviewFixtureState {
	readonly networkRequests: URL[];
	readonly unexpectedExternalRequests: string[];
	emitVehicles(payload: {
		readonly subway: readonly SubwayVehicle[];
		readonly capturedAt?: string;
	}): Promise<void>;
	emitAvailability(payload: {
		readonly subway: TransitAvailability;
		readonly observedAt?: string;
	}): Promise<void>;
	disconnect(): Promise<void>;
	connectionCount(): Promise<number>;
}

export function observeNetworkAudit(page: Page): NetworkAudit {
	const audit: NetworkAudit = {
		consoleErrors: [],
		pageErrors: [],
		requestFailures: [],
	};
	page.on("console", (message) => {
		if (message.type() === "error") audit.consoleErrors.push(message.text());
	});
	page.on("pageerror", (error) => audit.pageErrors.push(error.message));
	page.on("requestfailed", (request) => {
		audit.requestFailures.push(`${request.url()} :: ${request.failure()?.errorText ?? "unknown"}`);
	});
	return audit;
}

export async function installPreviewFixtures(
	page: Page,
	options: {
		readonly style?: object;
		readonly onStyle?: (route: Route) => Promise<void>;
		readonly onNetwork?: (route: Route, url: URL) => Promise<void>;
	} = {},
): Promise<PreviewFixtureState> {
	await installFakeEventSource(page);
	const networkRequests: URL[] = [];
	const unexpectedExternalRequests: string[] = [];
	await page.route(/^https:\/\//, async (route) => {
		unexpectedExternalRequests.push(route.request().url());
		await route.fulfill({ status: 418, body: "blocked external fixture" });
	});
	await page.route(/^https:\/\/(?:cdn\.jsdelivr\.net|fonts\.googleapis\.com)\//, (route) =>
		route.fulfill({
			contentType: "text/css; charset=utf-8",
			body: "/* deterministic empty font fixture */",
		}),
	);
	await page.route("https://*.tile.openstreetmap.org/**", (route) =>
		route.fulfill({
			contentType: "image/png",
			body: Buffer.from(
				"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+X8W7WQAAAABJRU5ErkJggg==",
				"base64",
			),
		}),
	);
	await page.route("**/register-sw.js?*", (route) =>
		route.fulfill({ contentType: "text/javascript", body: "" }),
	);
	await page.route(previewStyleUrl, async (route) => {
		if (options.onStyle) await options.onStyle(route);
		else await route.fulfill({ json: options.style ?? localBuildingStyle });
	});
	await page.route("**/api/transit-map/network?**", async (route) => {
		const url = new URL(route.request().url());
		networkRequests.push(url);
		if (options.onNetwork) await options.onNetwork(route, url);
		else await route.fulfill({ json: networkForZoom(Number(url.searchParams.get("zoom"))) });
	});

	return {
		networkRequests,
		unexpectedExternalRequests,
		emitVehicles: async ({ subway, capturedAt }) => {
			await page.evaluate((payload) => window.__motaTransitFixture.emit("vehicles", payload), {
				kind: "vehicles",
				subway,
				capturedAt: capturedAt ?? "2026-09-05T04:20:10.000Z",
			});
		},
		emitAvailability: async ({ subway, observedAt }) => {
			await page.evaluate((payload) => window.__motaTransitFixture.emit("availability", payload), {
				kind: "availability",
				subway,
				observedAt: observedAt ?? "2026-09-05T04:20:10.000Z",
			});
		},
		disconnect: () => page.evaluate(() => window.__motaTransitFixture.disconnect()),
		connectionCount: () => page.evaluate(() => window.__motaTransitFixture.connectionCount()),
	};
}

async function installFakeEventSource(page: Page) {
	await page.addInitScript(
		({ initialTrain }) => {
			type Listener = (event: MessageEvent | Event) => void;
			type VehiclesPayload = {
				kind: "vehicles";
				subway: unknown[];
				capturedAt: string;
			};
			const sources: FakeEventSource[] = [];
			let connectionAttempts = 0;
			// A reopened stream replays the latest observed snapshot, mirroring a
			// real server serving current positions for the new viewport.
			let lastVehicles: VehiclesPayload | null = null;

			class FakeEventSource {
				readonly listeners = new Map<string, Set<Listener>>();
				readonly url: string;
				closed = false;

				constructor(url: string | URL) {
					this.url = String(url);
					connectionAttempts += 1;
					sources.push(this);
					queueMicrotask(() => this.emitInitial());
				}

				addEventListener(type: string, listener: Listener) {
					let listeners = this.listeners.get(type);
					if (!listeners) {
						listeners = new Set();
						this.listeners.set(type, listeners);
					}
					listeners.add(listener);
				}

				close() {
					this.closed = true;
				}

				emit(type: string, payload?: object) {
					if (this.closed) return;
					const event = payload
						? new MessageEvent(type, { data: JSON.stringify(payload) })
						: new Event(type);
					for (const listener of this.listeners.get(type) ?? []) listener(event);
				}

				emitInitial() {
					if (this.closed) return;
					this.emit("ready", {
						kind: "ready",
						revision: "fixture-live",
						modes: ["subway"],
						serverTime: "2026-09-05T04:20:00.000Z",
					});
					this.emit("availability", {
						kind: "availability",
						subway: "live",
						observedAt: "2026-09-05T04:20:00.000Z",
					});
					this.emit(
						"vehicles",
						lastVehicles ?? {
							kind: "vehicles",
							subway: [initialTrain],
							capturedAt: "2026-09-05T04:20:00.000Z",
						},
					);
				}
			}

			window.__motaTransitFixture = {
				emit(type, payload) {
					if (type === "vehicles" && payload && "subway" in payload) {
						lastVehicles = payload as VehiclesPayload;
					}
					for (const source of sources) source.emit(type, payload);
				},
				disconnect() {
					const openSources = sources.filter((source) => !source.closed);
					for (const source of openSources) source.emit("error");
					connectionAttempts += openSources.length;
					queueMicrotask(() => {
						for (const source of openSources) {
							source.emit("ready", {
								kind: "ready",
								revision: "fixture-reconnected",
								modes: ["subway"],
								serverTime: "2026-09-05T04:20:20.000Z",
							});
						}
					});
				},
				connectionCount: () => connectionAttempts,
			};
			Object.defineProperty(window, "EventSource", {
				configurable: true,
				value: FakeEventSource,
			});
		},
		{ initialTrain: firstTrain },
	);
}

declare global {
	interface Window {
		__motaTransitFixture: {
			emit(type: string, payload: object): void;
			disconnect(): void;
			connectionCount(): number;
		};
	}
}
