// @vitest-environment jsdom

import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	fetchNearbyStops,
	fetchNearbySubwayStations,
} from "../../api/client";
import { busStopSchema, type BusStop } from "../../domain/bus";
import {
	subwayStationSchema,
	type SubwayStation,
} from "../../domain/subway";
import {
	type PreviewCenter,
	usePreviewNearbyPoints,
} from "./usePreviewNearbyPoints";

vi.mock("../../api/client", async (importOriginal) => {
	const original = await importOriginal<typeof import("../../api/client")>();
	return {
		...original,
		fetchNearbyStops: vi.fn<typeof original.fetchNearbyStops>(),
		fetchNearbySubwayStations:
			vi.fn<typeof original.fetchNearbySubwayStations>(),
	};
});

interface Deferred<T> {
	readonly promise: Promise<T>;
	readonly resolve: (value: T) => void;
	readonly reject: (reason: unknown) => void;
}

function deferred<T>(): Deferred<T> {
	let resolve!: (value: T) => void;
	let reject!: (reason: unknown) => void;
	const promise = new Promise<T>((nextResolve, nextReject) => {
		resolve = nextResolve;
		reject = nextReject;
	});
	return { promise, resolve, reject };
}

async function resolveRequest<T>(request: Deferred<T>, value: T) {
	await act(async () => {
		request.resolve(value);
		await request.promise;
	});
}

async function rejectRequest<T>(request: Deferred<T>, error: unknown) {
	await act(async () => {
		request.reject(error);
		await request.promise.catch(() => undefined);
	});
}

const busA = busStopSchema.parse({
	id: "bus-a",
	arsId: "12345",
	name: "A 정류장",
	lat: 37.5367,
	lng: 127.1254,
	distanceMeters: 20,
});

const busB = busStopSchema.parse({
	id: "bus-b",
	arsId: "67890",
	name: "B 정류장",
	lat: 37.537,
	lng: 127.126,
	distanceMeters: 40,
});

const stationA = subwayStationSchema.parse({
	id: "station-a",
	name: "A역",
	line: "8호선",
	lat: 37.5368,
	lng: 127.1255,
	distanceMeters: 200,
});

const stationB = subwayStationSchema.parse({
	id: "station-b",
	name: "B역",
	line: "5호선",
	lat: 37.5372,
	lng: 127.1262,
	distanceMeters: 400,
});

const centerA: PreviewCenter = { lat: 37.5366001, lng: 127.1253001 };
const centerASameAtSixDecimals: PreviewCenter = {
	lat: 37.5366002,
	lng: 127.1253002,
};
const centerB: PreviewCenter = { lat: 37.5366011, lng: 127.1253011 };

describe("usePreviewNearbyPoints", () => {
	beforeEach(() => {
		vi.mocked(fetchNearbyStops).mockReset();
		vi.mocked(fetchNearbySubwayStations).mockReset();
	});

	afterEach(() => {
		cleanup();
	});

	it("loads both catalogs initially and only reloads for a six-decimal-distinct center", async () => {
		const firstBus = deferred<BusStop[]>();
		const firstSubway = deferred<SubwayStation[]>();
		const secondBus = deferred<BusStop[]>();
		const secondSubway = deferred<SubwayStation[]>();
		vi.mocked(fetchNearbyStops)
			.mockReturnValueOnce(firstBus.promise)
			.mockReturnValueOnce(secondBus.promise);
		vi.mocked(fetchNearbySubwayStations)
			.mockReturnValueOnce(firstSubway.promise)
			.mockReturnValueOnce(secondSubway.promise);

		const { result, rerender } = renderHook(
			({ center }) => usePreviewNearbyPoints(center),
			{ initialProps: { center: centerA } },
		);

		expect(fetchNearbyStops).toHaveBeenCalledTimes(1);
		expect(fetchNearbySubwayStations).toHaveBeenCalledTimes(1);
		expect(fetchNearbyStops).toHaveBeenLastCalledWith(
			{ lat: 37.5366, lng: 127.1253 },
			800,
			expect.any(AbortSignal),
		);
		expect(fetchNearbySubwayStations).toHaveBeenLastCalledWith(
			{ lat: 37.5366, lng: 127.1253 },
			3000,
			expect.any(AbortSignal),
		);
		expect(result.current.bus).toMatchObject({ items: [], status: "loading" });
		expect(result.current.subway).toMatchObject({
			items: [],
			status: "loading",
		});

		await resolveRequest(firstBus, [busA]);
		await resolveRequest(firstSubway, [stationA]);

		rerender({ center: centerASameAtSixDecimals });
		expect(fetchNearbyStops).toHaveBeenCalledTimes(1);
		expect(fetchNearbySubwayStations).toHaveBeenCalledTimes(1);

		const firstBusSignal = vi.mocked(fetchNearbyStops).mock.calls[0]?.[2];
		const firstSubwaySignal = vi.mocked(fetchNearbySubwayStations).mock.calls[0]?.[2];
		rerender({ center: centerB });

		expect(firstBusSignal?.aborted).toBe(true);
		expect(firstSubwaySignal?.aborted).toBe(true);
		expect(fetchNearbyStops).toHaveBeenCalledTimes(2);
		expect(fetchNearbySubwayStations).toHaveBeenCalledTimes(2);
		expect(fetchNearbyStops).toHaveBeenLastCalledWith(
			{ lat: 37.536601, lng: 127.125301 },
			800,
			expect.any(AbortSignal),
		);
		expect(fetchNearbySubwayStations).toHaveBeenLastCalledWith(
			{ lat: 37.536601, lng: 127.125301 },
			3000,
			expect.any(AbortSignal),
		);
		expect(result.current.bus).toMatchObject({
			items: [busA],
			status: "loading",
		});
		expect(result.current.subway).toMatchObject({
			items: [stationA],
			status: "loading",
		});

		await resolveRequest(secondBus, [busB]);
		await resolveRequest(secondSubway, [stationB]);
	});

	it("ignores out-of-order work from an aborted center generation", async () => {
		const busAtA = deferred<BusStop[]>();
		const subwayAtA = deferred<SubwayStation[]>();
		const busAtB = deferred<BusStop[]>();
		const subwayAtB = deferred<SubwayStation[]>();
		vi.mocked(fetchNearbyStops)
			.mockReturnValueOnce(busAtA.promise)
			.mockReturnValueOnce(busAtB.promise);
		vi.mocked(fetchNearbySubwayStations)
			.mockReturnValueOnce(subwayAtA.promise)
			.mockReturnValueOnce(subwayAtB.promise);

		const { result, rerender } = renderHook(
			({ center }) => usePreviewNearbyPoints(center),
			{ initialProps: { center: centerA } },
		);
		rerender({ center: centerB });

		await resolveRequest(busAtB, [busB]);
		await resolveRequest(subwayAtB, [stationB]);
		expect(result.current.bus).toMatchObject({
			items: [busB],
			status: "success",
			error: null,
		});
		expect(result.current.subway).toMatchObject({
			items: [stationB],
			status: "success",
			error: null,
		});

		await resolveRequest(busAtA, [busA]);
		await rejectRequest(
			subwayAtA,
			new DOMException("The operation was aborted", "AbortError"),
		);

		expect(result.current.bus).toMatchObject({
			items: [busB],
			status: "success",
			error: null,
		});
		expect(result.current.subway).toMatchObject({
			items: [stationB],
			status: "success",
			error: null,
		});
	});

	it("aborts both catalog requests on unmount", () => {
		const busRequest = deferred<BusStop[]>();
		const subwayRequest = deferred<SubwayStation[]>();
		vi.mocked(fetchNearbyStops).mockReturnValue(busRequest.promise);
		vi.mocked(fetchNearbySubwayStations).mockReturnValue(
			subwayRequest.promise,
		);
		const { unmount } = renderHook(() => usePreviewNearbyPoints(centerA));
		const busSignal = vi.mocked(fetchNearbyStops).mock.calls[0]?.[2];
		const subwaySignal = vi.mocked(fetchNearbySubwayStations).mock.calls[0]?.[2];

		unmount();

		expect(busSignal?.aborted).toBe(true);
		expect(subwaySignal?.aborted).toBe(true);
	});

	it("keeps subway success independent from a bus failure", async () => {
		const busRequest = deferred<BusStop[]>();
		const subwayRequest = deferred<SubwayStation[]>();
		const busError = new Error("bus unavailable");
		vi.mocked(fetchNearbyStops).mockReturnValue(busRequest.promise);
		vi.mocked(fetchNearbySubwayStations).mockReturnValue(
			subwayRequest.promise,
		);
		const { result } = renderHook(() => usePreviewNearbyPoints(centerA));

		await resolveRequest(subwayRequest, [stationA]);
		await rejectRequest(busRequest, busError);

		expect(result.current.bus).toMatchObject({
			items: [],
			status: "error",
			error: busError,
		});
		expect(result.current.subway).toMatchObject({
			items: [stationA],
			status: "success",
			error: null,
		});
	});

	it("keeps bus success independent from a subway failure", async () => {
		const busRequest = deferred<BusStop[]>();
		const subwayRequest = deferred<SubwayStation[]>();
		const subwayError = new Error("subway unavailable");
		vi.mocked(fetchNearbyStops).mockReturnValue(busRequest.promise);
		vi.mocked(fetchNearbySubwayStations).mockReturnValue(
			subwayRequest.promise,
		);
		const { result } = renderHook(() => usePreviewNearbyPoints(centerA));

		await resolveRequest(busRequest, [busA]);
		await rejectRequest(subwayRequest, subwayError);

		expect(result.current.bus).toMatchObject({
			items: [busA],
			status: "success",
			error: null,
		});
		expect(result.current.subway).toMatchObject({
			items: [],
			status: "error",
			error: subwayError,
		});
	});

	it("retains previous successful items when a center refresh fails", async () => {
		const firstBus = deferred<BusStop[]>();
		const firstSubway = deferred<SubwayStation[]>();
		const refreshedBus = deferred<BusStop[]>();
		const refreshedSubway = deferred<SubwayStation[]>();
		vi.mocked(fetchNearbyStops)
			.mockReturnValueOnce(firstBus.promise)
			.mockReturnValueOnce(refreshedBus.promise);
		vi.mocked(fetchNearbySubwayStations)
			.mockReturnValueOnce(firstSubway.promise)
			.mockReturnValueOnce(refreshedSubway.promise);
		const { result, rerender } = renderHook(
			({ center }) => usePreviewNearbyPoints(center),
			{ initialProps: { center: centerA } },
		);
		await resolveRequest(firstBus, [busA]);
		await resolveRequest(firstSubway, [stationA]);

		rerender({ center: centerB });
		const refreshError = new Error("bus refresh unavailable");
		await rejectRequest(refreshedBus, refreshError);

		expect(result.current.bus).toMatchObject({
			items: [busA],
			status: "error",
			error: refreshError,
		});
		expect(result.current.subway).toMatchObject({
			items: [stationA],
			status: "loading",
			error: null,
		});

		await resolveRequest(refreshedSubway, [stationB]);
	});

	it("represents independently settled empty catalogs", async () => {
		const busRequest = deferred<BusStop[]>();
		const subwayRequest = deferred<SubwayStation[]>();
		vi.mocked(fetchNearbyStops).mockReturnValue(busRequest.promise);
		vi.mocked(fetchNearbySubwayStations).mockReturnValue(
			subwayRequest.promise,
		);
		const { result } = renderHook(() => usePreviewNearbyPoints(centerA));

		await resolveRequest(busRequest, []);
		expect(result.current.bus).toMatchObject({
			items: [],
			status: "empty",
			error: null,
		});
		expect(result.current.subway.status).toBe("loading");

		await resolveRequest(subwayRequest, []);
		expect(result.current.subway).toMatchObject({
			items: [],
			status: "empty",
			error: null,
		});
	});

	it("retries only the failed bus catalog at the current center", async () => {
		const firstBus = deferred<BusStop[]>();
		const subwayRequest = deferred<SubwayStation[]>();
		const retriedBus = deferred<BusStop[]>();
		vi.mocked(fetchNearbyStops)
			.mockReturnValueOnce(firstBus.promise)
			.mockReturnValueOnce(retriedBus.promise);
		vi.mocked(fetchNearbySubwayStations).mockReturnValue(
			subwayRequest.promise,
		);
		const { result } = renderHook(() => usePreviewNearbyPoints(centerB));
		await rejectRequest(firstBus, new Error("bus unavailable"));
		await resolveRequest(subwayRequest, [stationB]);

		act(() => result.current.bus.retry());

		expect(fetchNearbyStops).toHaveBeenCalledTimes(2);
		expect(fetchNearbySubwayStations).toHaveBeenCalledTimes(1);
		expect(fetchNearbyStops).toHaveBeenLastCalledWith(
			{ lat: 37.536601, lng: 127.125301 },
			800,
			expect.any(AbortSignal),
		);
		expect(result.current.bus).toMatchObject({ items: [], status: "loading" });
		expect(result.current.subway).toMatchObject({
			items: [stationB],
			status: "success",
		});

		await resolveRequest(retriedBus, [busB]);
		expect(result.current.bus).toMatchObject({
			items: [busB],
			status: "success",
			error: null,
		});
	});

	it("retries only the failed subway catalog at the current center", async () => {
		const busRequest = deferred<BusStop[]>();
		const firstSubway = deferred<SubwayStation[]>();
		const retriedSubway = deferred<SubwayStation[]>();
		vi.mocked(fetchNearbyStops).mockReturnValue(busRequest.promise);
		vi.mocked(fetchNearbySubwayStations)
			.mockReturnValueOnce(firstSubway.promise)
			.mockReturnValueOnce(retriedSubway.promise);
		const { result } = renderHook(() => usePreviewNearbyPoints(centerB));
		await resolveRequest(busRequest, [busB]);
		await rejectRequest(firstSubway, new Error("subway unavailable"));

		act(() => result.current.subway.retry());

		expect(fetchNearbyStops).toHaveBeenCalledTimes(1);
		expect(fetchNearbySubwayStations).toHaveBeenCalledTimes(2);
		expect(fetchNearbySubwayStations).toHaveBeenLastCalledWith(
			{ lat: 37.536601, lng: 127.125301 },
			3000,
			expect.any(AbortSignal),
		);
		expect(result.current.bus).toMatchObject({
			items: [busB],
			status: "success",
		});
		expect(result.current.subway).toMatchObject({
			items: [],
			status: "loading",
		});

		await resolveRequest(retriedSubway, [stationB]);
		expect(result.current.subway).toMatchObject({
			items: [stationB],
			status: "success",
			error: null,
		});
	});
});
