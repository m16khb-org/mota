// @vitest-environment jsdom

import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TransitMapEvent, TransitMapNetwork } from "@mota/contracts/transit-map";
import type { MapViewport, TransitMapEventHandlers } from "../../api/transitMapClient";
import {
	type LiveTransitMapDependencies,
	useLiveTransitMap,
} from "./useLiveTransitMap";

const viewport: MapViewport = {
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
		lines: { type: "FeatureCollection" as const, features: [] },
		stations: { type: "FeatureCollection" as const, features: [] },
	},
	bus: {
		enabled: true,
		attribution: "서울특별시 교통정보",
		routes: { type: "FeatureCollection" as const, features: [] },
		stops: { type: "FeatureCollection" as const, features: [] },
	},
} satisfies TransitMapNetwork;

const train = {
	id: "subway:1008:8120",
	mode: "subway" as const,
	routeId: "1008",
	routeName: "8호선",
	coordinates: [127.11, 37.53] as [number, number],
	bearing: 0,
	direction: "상행",
	capturedAt: "2026-09-05T04:00:00.000Z",
	positionBasis: "station-segment" as const,
};

const bus = {
	...train,
	id: "bus:124100001:vehicle-a",
	mode: "bus" as const,
	routeId: "124100001",
	routeName: "341",
	positionBasis: "gps" as const,
};

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (error: unknown) => void;
	const promise = new Promise<T>((nextResolve, nextReject) => {
		resolve = nextResolve;
		reject = nextReject;
	});
	return { promise, resolve, reject };
}

function fixture(networkPromise: Promise<TransitMapNetwork> = Promise.resolve(network)) {
	let handlers: TransitMapEventHandlers | undefined;
	const close = vi.fn();
	const dependencies: LiveTransitMapDependencies = {
		fetchNetwork: vi.fn((_viewport, _signal) => networkPromise),
		openEvents: vi.fn((_viewport, nextHandlers) => {
			handlers = nextHandlers;
			return { close };
		}),
	};
	return {
		dependencies,
		close,
		emit: (event: TransitMapEvent) => handlers?.onEvent(event),
		connectionError: () => handlers?.onConnectionError(),
	};
}

afterEach(cleanup);

describe("useLiveTransitMap", () => {
	it("loads the network before opening the stream and replaces complete snapshots", async () => {
		const request = deferred<TransitMapNetwork>();
		const live = fixture(request.promise);
		const { result } = renderHook(() =>
			useLiveTransitMap(viewport, live.dependencies),
		);

		expect(result.current.loading).toBe(true);
		expect(live.dependencies.openEvents).not.toHaveBeenCalled();
		await act(async () => request.resolve(network));
		expect(result.current.network).toEqual(network);
		expect(live.dependencies.openEvents).toHaveBeenCalledOnce();

		act(() => {
			live.emit({
				kind: "ready",
				revision: "revision-1",
				modes: ["bus", "subway"],
				serverTime: "2026-09-05T04:00:00.000Z",
			});
			live.emit({
				kind: "availability",
				bus: "live",
				subway: "live",
				observedAt: "2026-09-05T04:00:00.000Z",
			});
			live.emit({
				kind: "vehicles",
				bus: [bus],
				subway: [train],
				capturedAt: "2026-09-05T04:00:00.000Z",
			});
		});

		expect(result.current.connection).toBe("live");
		expect(result.current.vehicles).toEqual({ bus: [bus], subway: [train] });
		expect(result.current.lastServerTime).toBe("2026-09-05T04:00:00.000Z");
	});

	it("clears one unavailable mode and clears both modes on connection error", async () => {
		const live = fixture();
		const { result } = renderHook(() =>
			useLiveTransitMap(viewport, live.dependencies),
		);
		await act(async () => undefined);
		act(() => {
			live.emit({
				kind: "vehicles",
				bus: [bus],
				subway: [train],
				capturedAt: "2026-09-05T04:00:00.000Z",
			});
			live.emit({
				kind: "availability",
				bus: "unavailable",
				subway: "live",
				observedAt: "2026-09-05T04:00:01.000Z",
			});
		});
		expect(result.current.vehicles).toEqual({ bus: [], subway: [train] });

		act(() => live.connectionError());
		expect(result.current.connection).toBe("reconnecting");
		expect(result.current.vehicles).toEqual({ bus: [], subway: [] });
	});

	it("aborts and closes old work on viewport change and unmount", async () => {
		const live = fixture();
		const { rerender, unmount } = renderHook(
			({ currentViewport }) =>
				useLiveTransitMap(currentViewport, live.dependencies),
			{ initialProps: { currentViewport: viewport } },
		);
		await act(async () => undefined);
		const firstSignal = vi.mocked(live.dependencies.fetchNetwork).mock.calls[0]?.[1];

		rerender({
			currentViewport: { ...viewport, west: 127.100001, east: 127.120001 },
		});
		await act(async () => undefined);
		expect(firstSignal?.aborted).toBe(true);
		expect(live.close).toHaveBeenCalledTimes(1);

		unmount();
		expect(live.close).toHaveBeenCalledTimes(2);
	});
});
