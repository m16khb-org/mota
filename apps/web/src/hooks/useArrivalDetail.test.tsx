// @vitest-environment jsdom

import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchSubwayArrivals } from "../api/client";
import { subwayStationSchema } from "../domain/subway";
import { useArrivalDetail } from "./useArrivalDetail";

vi.mock("../api/client", async (importOriginal) => {
	const original = await importOriginal<typeof import("../api/client")>();
	return {
		...original,
		fetchSubwayArrivals: vi.fn<typeof original.fetchSubwayArrivals>(),
	};
});

const amsaStation = subwayStationSchema.parse({
	id: "seoul-2828",
	name: "암사",
	line: "8호선",
	lat: 37.55021,
	lng: 127.12756,
	distanceMeters: 0,
});

describe("useArrivalDetail", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.mocked(fetchSubwayArrivals).mockReset();
		vi.mocked(fetchSubwayArrivals).mockResolvedValue({
			arrivals: [],
			updatedAt: "2026-09-01T00:01:19.000Z",
		});
	});

	afterEach(() => {
		cleanup();
		vi.useRealTimers();
	});

	it("refreshes a selected subway station every minute", async () => {
		// Given
		renderHook(() =>
			useArrivalDetail({
				selectedStops: [],
				selectedStation: amsaStation,
			}),
		);
		await act(async () => undefined);
		expect(fetchSubwayArrivals).toHaveBeenCalledTimes(1);

		// When
		await act(async () => {
			await vi.advanceTimersByTimeAsync(60_000);
		});

		// Then
		expect(fetchSubwayArrivals).toHaveBeenCalledTimes(2);
		expect(fetchSubwayArrivals).toHaveBeenLastCalledWith("암사");
	});

	it("requests the selected subway station on every explicit refresh", async () => {
		// Given
		const { result } = renderHook(() =>
			useArrivalDetail({
				selectedStops: [],
				selectedStation: amsaStation,
			}),
		);
		await act(async () => undefined);
		expect(fetchSubwayArrivals).toHaveBeenCalledTimes(1);

		// When
		await act(async () => {
			result.current.refreshSubwayDetail();
			await Promise.resolve();
		});
		await act(async () => {
			result.current.refreshSubwayDetail();
			await Promise.resolve();
		});

		// Then
		expect(fetchSubwayArrivals).toHaveBeenCalledTimes(3);
		expect(fetchSubwayArrivals).toHaveBeenLastCalledWith("암사");
	});
});
