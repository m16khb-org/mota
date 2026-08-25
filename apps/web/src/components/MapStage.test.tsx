// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchNearbyStops,
  fetchNearbySubwayStations,
} from "../api/client";
import type { BusStop } from "../domain/bus";
import type { SubwayStation } from "../domain/subway";
import { MapStage } from "./MapStage";

vi.mock("./MapCanvas", () => ({
  MapCanvas: ({
    pendingStops = [],
    pendingSubwayStations = [],
    selectedStopIds = [],
    selectedSubwayStationIds = [],
    onAddPending,
    onAddPendingSubway,
  }: {
    pendingStops?: readonly BusStop[];
    pendingSubwayStations?: readonly SubwayStation[];
    selectedStopIds?: readonly BusStop["id"][];
    selectedSubwayStationIds?: readonly SubwayStation["id"][];
    onAddPending?: (stop: BusStop) => void;
    onAddPendingSubway?: (station: SubwayStation) => void;
  }) => (
    <div data-testid="map-canvas">
      {pendingStops.map((stop) => (
        <button
          key={stop.id}
          type="button"
          aria-pressed={selectedStopIds.includes(stop.id)}
          onClick={() => onAddPending?.(stop)}
        >
          후보 정류장 {stop.name}
        </button>
      ))}
      {pendingSubwayStations.map((station) => (
        <button
          key={station.id}
          type="button"
          aria-pressed={selectedSubwayStationIds.includes(station.id)}
          onClick={() => onAddPendingSubway?.(station)}
        >
          후보 지하철역 {station.name}
        </button>
      ))}
    </div>
  ),
}));

vi.mock("../api/client", async (importOriginal) => {
  const original = await importOriginal<typeof import("../api/client")>();
  return {
    ...original,
    fetchNearbyStops: vi.fn(),
    fetchNearbySubwayStations: vi.fn(),
  };
});

const busStop: BusStop = {
  id: "bus-stop" as BusStop["id"],
  arsId: "25014" as BusStop["arsId"],
  name: "천호역",
  lat: 37.5379,
  lng: 127.1255,
  distanceMeters: 151,
};

const subwayStation: SubwayStation = {
  id: "subway-station" as SubwayStation["id"],
  name: "천호",
  line: "8호선",
  lat: 37.5385,
  lng: 127.1234,
  distanceMeters: 228,
};

function renderStage(
  isDesktop: boolean,
  searchMode: "bus" | "subway" | null = null,
) {
  const onCancelSearch = vi.fn();
  const onSaveBusStops = vi.fn();
  const onSaveSubwayStations = vi.fn();
  return render(
    <MapStage
      stops={[]}
      subwayStations={[]}
      selectedStops={[]}
      selectedSubwayStation={null}
      center={{ lat: 37.5366, lng: 127.1253 }}
      isDesktop={isDesktop}
      searchMode={searchMode}
      onCancelSearch={onCancelSearch}
      onSaveBusStops={onSaveBusStops}
      onSaveSubwayStations={onSaveSubwayStations}
      onSelectStop={vi.fn()}
      onSelectSubwayStation={vi.fn()}
    />,
  );
}

describe("MapStage responsive map", () => {
  beforeEach(() => {
    vi.mocked(fetchNearbyStops).mockReset();
    vi.mocked(fetchNearbySubwayStations).mockReset();
    vi.mocked(fetchNearbyStops).mockResolvedValue([busStop]);
    vi.mocked(fetchNearbySubwayStations).mockResolvedValue([
      subwayStation,
    ]);
  });

  it("keeps the mobile map compact until the user expands it", () => {
    renderStage(false);
    const stage = screen.getByRole("region", {
      name: "선택한 정류장과 역 지도",
    });
    const toggle = screen.getByRole("button", { name: "지도 펼치기" });

    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(stage).not.toHaveClass("is-expanded");

    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(stage).toHaveClass("is-expanded");
  });

  it("does not render an expansion control on desktop", () => {
    renderStage(true);

    expect(
      screen.queryByRole("button", { name: "지도 펼치기" }),
    ).not.toBeInTheDocument();
  });

  it("searches and saves bus stops on the existing map without a dialog", async () => {
    const { container } = renderStage(false, "bus");

    await waitFor(() =>
      expect(fetchNearbyStops).toHaveBeenCalledWith({
        lat: 37.5366,
        lng: 127.1253,
      }),
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "버스 정류장 지도 찾기" }),
    ).toHaveFocus();
    expect(container.querySelector(".map-stage")).toHaveClass(
      "is-searching",
      "is-expanded",
    );

    fireEvent.click(
      await screen.findByRole("button", {
        name: "후보 정류장 천호역",
      }),
    );
    expect(
      screen.getByRole("button", { name: "1곳 저장" }),
    ).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "1곳 저장" }));

    expect(
      screen.queryByRole("button", { name: "지도 펼치기" }),
    ).not.toBeInTheDocument();
  });

  it("searches and saves subway stations on the existing map", async () => {
    renderStage(true, "subway");

    await waitFor(() =>
      expect(fetchNearbySubwayStations).toHaveBeenCalledWith({
        lat: 37.5366,
        lng: 127.1253,
      }),
    );
    fireEvent.click(
      await screen.findByRole("button", {
        name: "후보 지하철역 천호",
      }),
    );
    expect(
      screen.getByRole("button", { name: "1곳 저장" }),
    ).toBeEnabled();
  });
});
