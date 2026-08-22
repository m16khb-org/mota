// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MapStage } from "./MapStage";

vi.mock("../api/client", () => ({
  fetchNearbyStops: vi.fn(),
  fetchNearbySubwayStations: vi.fn(),
  isServiceAreaError: vi.fn(),
}));

vi.mock("./MapCanvas", () => ({
  MapCanvas: () => <div data-testid="map-canvas" />,
}));

function renderStage(isDesktop: boolean) {
  return render(
    <MapStage
      direction="company"
      place={null}
      selectedStop={null}
      selectedSubwayStationId={null}
      center={{ lat: 37.5366, lng: 127.1253 }}
      searchRequest={0}
      isDesktop={isDesktop}
      onSelectStop={vi.fn()}
      onSelectSubway={vi.fn()}
      onSaveStop={vi.fn()}
      onSaveSubwayStation={vi.fn()}
    />,
  );
}

describe("MapStage mobile map expansion", () => {
  it("keeps the map collapsed by default and expands on the toggle", () => {
    const { getByRole } = renderStage(false);
    const stage = getByRole("region", { name: "선택한 통근 정류장 안내" });
    const toggle = screen.getByRole("button", { name: "지도 펼치기" });

    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(stage.className).not.toContain("is-expanded");

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "지도 접기" })).toBe(toggle);
    expect(stage.className).toContain("is-expanded");

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(stage.className).not.toContain("is-expanded");
  });

  it("does not render the map toggle on desktop", () => {
    renderStage(true);

    expect(
      screen.queryByRole("button", { name: "지도 펼치기" }),
    ).not.toBeInTheDocument();
  });
});
