// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { fetchArrivals } from "../api/client";
import { busStopSchema } from "../domain/bus";
import { useArrivalDetail } from "./useArrivalDetail";
vi.mock("../api/client", () => ({ fetchArrivals: vi.fn() }));
const stop = busStopSchema.parse({
  id: "stop-1",
  arsId: "25014",
  name: "천호역",
  lat: 37.53,
  lng: 127.12,
  distanceMeters: 100,
});
const snapshot: Awaited<ReturnType<typeof fetchArrivals>> = {
  arrivals: [
    {
      routeId: "route-1" as Awaited<
        ReturnType<typeof fetchArrivals>
      >["arrivals"][number]["routeId"],
      routeName: "341",
      direction: "강동",
      routeType: "3",
      lowFloor: true,
      first: { message: "3분 후", seconds: 180, remainingStops: 2, congestion: null },
      second: null,
    },
  ],
  updatedAt: "2026-09-01T00:00:00.000Z",
};
beforeEach(() => {
  vi.mocked(fetchArrivals).mockReset();
});
afterEach(cleanup);
it("preserves the successful bus snapshot after a refresh failure and recovers on retry", async () => {
  vi.mocked(fetchArrivals)
    .mockResolvedValueOnce(snapshot)
    .mockRejectedValueOnce(new TypeError("offline"))
    .mockResolvedValueOnce({ ...snapshot, updatedAt: "2026-09-01T00:01:00.000Z" });
  const { result } = renderHook(() => useArrivalDetail({ selectedStops: [stop] }));
  await waitFor(() =>
    expect(result.current.busDetail(stop.id).arrivals).toEqual(snapshot.arrivals),
  );
  act(() => result.current.refreshBusDetail());
  await waitFor(() => expect(result.current.busDetail(stop.id).error).toBeTruthy());
  expect(result.current.busDetail(stop.id).arrivals).toEqual(snapshot.arrivals);
  expect(result.current.busDetail(stop.id).updatedAt).toBe(snapshot.updatedAt);
  act(() => result.current.refreshBusDetail());
  await waitFor(() =>
    expect(result.current.busDetail(stop.id).updatedAt).toBe("2026-09-01T00:01:00.000Z"),
  );
  expect(result.current.busDetail(stop.id).error).toBeNull();
});
it("ignores arrivals completing after a stop is deselected", async () => {
  let resolve!: (value: typeof snapshot) => void;
  vi.mocked(fetchArrivals).mockReturnValue(
    new Promise((done) => {
      resolve = done;
    }),
  );
  const { result, rerender } = renderHook(
    ({ selectedStops }) => useArrivalDetail({ selectedStops }),
    { initialProps: { selectedStops: [stop] } },
  );
  rerender({ selectedStops: [] });
  await act(async () => resolve(snapshot));
  expect(result.current.busDetails.size).toBe(0);
});
