import { describe, expect, it, vi } from "vitest";
import {
	fetchTransitMapNetwork,
	openTransitMapEvents,
	type EventSourceLike,
} from "./transitMapClient";

const viewport = {
	west: 127.1,
	south: 37.52,
	east: 127.12,
	north: 37.54,
	zoom: 16,
};

const network = {
	revision: "revision-1",
	generatedAt: "2026-09-05T00:00:00.000Z",
	subway: {
		attribution: "© OpenStreetMap contributors, ODbL",
		lines: { type: "FeatureCollection", features: [] },
		stations: { type: "FeatureCollection", features: [] },
	},
	bus: {
		enabled: false,
		reason: "unconfigured",
		attribution: "서울특별시 교통정보",
		routes: { type: "FeatureCollection", features: [] },
		stops: { type: "FeatureCollection", features: [] },
	},
};

class FakeEventSource implements EventSourceLike {
	readonly listeners = new Map<string, Array<(event: MessageEvent) => void>>();
	readonly close = vi.fn();

	addEventListener(type: string, listener: (event: MessageEvent) => void) {
		const listeners = this.listeners.get(type) ?? [];
		listeners.push(listener);
		this.listeners.set(type, listeners);
	}

	emit(type: string, data = "") {
		for (const listener of this.listeners.get(type) ?? []) {
			listener(new MessageEvent(type, { data }));
		}
	}
}

describe("transit map browser client", () => {
	it("fetches a schema-valid network with canonical six-decimal query values", async () => {
		const fetcher = vi.fn().mockResolvedValue(Response.json(network));
		const signal = new AbortController().signal;

		await expect(
			fetchTransitMapNetwork(viewport, signal, fetcher),
		).resolves.toEqual(network);
		expect(fetcher).toHaveBeenCalledWith(
			"/api/transit-map/network?west=127.100000&south=37.520000&east=127.120000&north=37.540000&zoom=16.000000",
			{ signal },
		);
	});

	it("rejects invalid network responses", async () => {
		const fetcher = vi.fn().mockResolvedValue(Response.json({ revision: "bad" }));
		await expect(
			fetchTransitMapNetwork(viewport, new AbortController().signal, fetcher),
		).rejects.toThrow();
	});

	it("parses only named transit events and reports protocol and connection failures", () => {
		const source = new FakeEventSource();
		const onEvent = vi.fn();
		const onProtocolError = vi.fn();
		const onConnectionError = vi.fn();
		const connection = openTransitMapEvents(
			viewport,
			{ onEvent, onProtocolError, onConnectionError },
			(url) => {
				expect(url).toContain("/api/transit-map/events?west=127.100000");
				return source;
			},
		);

		for (const event of [
			{
				kind: "ready",
				revision: "revision-1",
				modes: ["subway"],
				serverTime: "2026-09-05T04:00:00.000Z",
			},
			{
				kind: "availability",
				bus: "unconfigured",
				subway: "live",
				observedAt: "2026-09-05T04:00:00.000Z",
			},
			{
				kind: "vehicles",
				bus: [],
				subway: [],
				capturedAt: "2026-09-05T04:00:00.000Z",
			},
			{
				kind: "heartbeat",
				serverTime: "2026-09-05T04:00:15.000Z",
			},
		]) {
			source.emit(event.kind, JSON.stringify(event));
		}
		source.emit("ready", "not-json");
		source.emit("error");

		expect(onEvent).toHaveBeenCalledTimes(4);
		expect(onProtocolError).toHaveBeenCalledTimes(1);
		expect(onConnectionError).toHaveBeenCalledTimes(1);
		connection.close();
		expect(source.close).toHaveBeenCalledOnce();
	});
});
