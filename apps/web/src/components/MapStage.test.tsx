// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchNearbyStops } from "../api/client";
import type { BusStop } from "../domain/bus";
import { MapStage } from "./MapStage";

vi.mock("./MapCanvas", () => ({
  MapCanvas: ({
    pendingStops = [],
    selectedStopIds = [],
    onAddPending,
  }: {
    pendingStops?: readonly BusStop[];
    selectedStopIds?: readonly BusStop["id"][];
    onAddPending?: (stop: BusStop) => void;
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
    </div>
  ),
}));

vi.mock("../api/client", async (importOriginal) => {
  const original = await importOriginal<typeof import("../api/client")>();
  return {
    ...original,
    fetchNearbyStops: vi.fn(),
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

function renderStage(isDesktop: boolean, searchMode: "bus" | null = null) {
  const onCloseMobileMap = vi.fn();
  const onCancelSearch = vi.fn();
  const onSaveBusStops = vi.fn();
  const view = render(
    <MapStage
      stops={[]}
      selectedStops={[]}
      center={{ lat: 37.5366, lng: 127.1253 }}
      isDesktop={isDesktop}
      searchMode={searchMode}
      onCloseMobileMap={onCloseMobileMap}
      onCancelSearch={onCancelSearch}
      onSaveBusStops={onSaveBusStops}
      onSelectStop={vi.fn()}
    />,
  );
  return { ...view, onCloseMobileMap };
}

describe("MapStage responsive map", () => {
  beforeEach(() => {
    vi.mocked(fetchNearbyStops).mockReset();
    vi.mocked(fetchNearbyStops).mockResolvedValue([busStop]);
  });

  it("lets the user close an open mobile map", () => {
    const { onCloseMobileMap } = renderStage(false);

    fireEvent.click(screen.getByRole("button", { name: "지도 닫기" }));

    expect(onCloseMobileMap).toHaveBeenCalledOnce();
  });

  it("does not render an expansion control on desktop", () => {
    renderStage(true);

    expect(screen.queryByRole("button", { name: "지도 닫기" })).not.toBeInTheDocument();
  });

  it("lets the result reel shrink inside its panel before scrolling", async () => {
    const { readFile } = await import("node:fs/promises");
    const { resolve } = await import("node:path");
    const css = await readFile(resolve(process.cwd(), "src/styles.css"), "utf8");
    const reelRule = css.match(/\.inline-map-result-reel \{[^}]+\}/);

    expect(reelRule?.[0]).toContain("min-inline-size: 0;");
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
    expect(screen.getByRole("region", { name: "버스 정류장 지도 찾기" })).toHaveFocus();
    expect(container.querySelector(".map-stage")).toHaveClass("is-searching");

    fireEvent.click(
      await screen.findByRole("button", {
        name: "후보 정류장 천호역",
      }),
    );
    expect(screen.getByRole("button", { name: "1곳 저장" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "1곳 저장" }));

    expect(screen.queryByRole("button", { name: "지도 닫기" })).not.toBeInTheDocument();
  });
});
