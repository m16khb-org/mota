/** @vitest-environment jsdom */
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { fetchArrivals } from "../api/client";
import type { BusArrival, BusStop } from "../domain/bus";
import type {
  CommuteRouteOption,
  CommuteRouteOptionId,
} from "../domain/commute";
import type { CommutePlace } from "../hooks/useCommuteStops";
import { RouteComparison } from "./RouteComparison";

vi.mock("../api/client", () => ({
  fetchArrivals: vi.fn(),
}));

const stop = (
  id: string,
  arsId: string,
  name: string,
): BusStop => ({
  id: id as BusStop["id"],
  arsId: arsId as BusStop["arsId"],
  name,
  lat: 37.53,
  lng: 127.12,
  distanceMeters: 100,
});

const route = (
  id: string,
  startStopId: BusStop["id"],
): CommuteRouteOption => ({
  id: id as CommuteRouteOptionId,
  startStopId,
  transferStationId: null,
});

const arrival = (routeName: string, seconds: number): BusArrival => ({
  routeId: `route-${routeName}` as BusArrival["routeId"],
  routeName,
  direction: "강동공영차고지",
  routeType: "3",
  lowFloor: false,
  first: {
    message: `${seconds}초 후`,
    seconds,
    remainingStops: 1,
    congestion: null,
  },
  second: null,
});

describe("RouteComparison", () => {
  it("recommends the route with the shortest fresh boarding wait", async () => {
    const slowStop = stop("stop-slow", "25014", "암사 출발");
    const fastStop = stop("stop-fast", "25015", "천호 출발");
    const slowRoute = route("route-slow", slowStop.id);
    const fastRoute = route("route-fast", fastStop.id);
    const place: CommutePlace = {
      id: "company-1",
      name: "회사",
      stops: [slowStop, fastStop],
      subwayStations: [],
      selectedStopId: slowStop.id,
      routeOptions: [slowRoute, fastRoute],
      activeRouteOptionId: slowRoute.id,
    };
    vi.mocked(fetchArrivals).mockImplementation(async (arsId) => ({
      arrivals:
        arsId === fastStop.arsId
          ? [arrival("강동05", 90)]
          : [arrival("3411", 300)],
      updatedAt: "2026-08-18T12:00:00.000Z",
    }));

    render(
      <RouteComparison
        place={place}
        onAdd={vi.fn()}
        onRemove={vi.fn()}
        onSelect={vi.fn()}
      />,
    );

    const recommendation = await screen.findByText("지금 출발 추천");
    const fastCard = recommendation.closest("article");
    expect(fastCard).not.toBeNull();
    expect(within(fastCard as HTMLElement).getByText("천호 출발")).toBeVisible();
    expect(within(fastCard as HTMLElement).getByText("2분")).toBeVisible();
    expect(fetchArrivals).toHaveBeenCalledTimes(2);

    fireEvent.click(
      screen.getByRole("button", { name: "루트 도착정보 새로고침" }),
    );
    await waitFor(() => {
      expect(fetchArrivals).toHaveBeenCalledTimes(4);
    });
  });
});
