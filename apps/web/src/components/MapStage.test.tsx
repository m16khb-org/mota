// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MapStage } from "./MapStage";

vi.mock("./MapCanvas", () => ({
  MapCanvas: () => <div data-testid="map-canvas" />,
}));

function renderStage(isDesktop: boolean) {
  return render(
    <MapStage
      stops={[]}
      subwayStations={[]}
      selectedStop={null}
      selectedSubwayStation={null}
      center={{ lat: 37.5366, lng: 127.1253 }}
      isDesktop={isDesktop}
      onSelectStop={vi.fn()}
      onSelectSubwayStation={vi.fn()}
    />,
  );
}

describe("MapStage responsive map", () => {
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
});
