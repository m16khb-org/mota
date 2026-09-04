// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { BusStop } from "../domain/bus";
import type { SubwayStation } from "../domain/subway";
import { TransitPointSelector } from "./TransitPointSelector";

function renderSelector() {
  const onModeChange = vi.fn();
  const onAdd = vi.fn();
  render(
    <TransitPointSelector
      mode="bus"
      busStops={[] as readonly BusStop[]}
      subwayStations={[] as readonly SubwayStation[]}
      selectedBusStopIds={[]}
      selectedSubwayStationId={null}
      searching={false}
      onModeChange={onModeChange}
      onAdd={onAdd}
      onSelectBusStop={vi.fn()}
      onSelectSubwayStation={vi.fn()}
      onRemoveBusStop={vi.fn()}
      onRemoveSubwayStation={vi.fn()}
    />,
  );
  return { onAdd, onModeChange };
}

describe("TransitPointSelector", () => {
  it("renders exactly one same-tab 3D preview link after the transit tabs", () => {
    renderSelector();

    const links = screen.getAllByRole("link", { name: "3D 지도 미리보기" });
    expect(links).toHaveLength(1);
    const link = links[0];
    if (link === undefined) {
      throw new Error("3D preview link is missing");
    }
    expect(link).toHaveAttribute("href", "/3d-preview");
    expect(link).not.toHaveAttribute("target");
    expect(
      screen
        .getByRole("tablist", { name: "교통수단 선택" })
        .compareDocumentPosition(link),
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it("keeps transit-mode and search callbacks available", () => {
    const { onAdd, onModeChange } = renderSelector();

    fireEvent.click(screen.getByRole("tab", { name: "지하철" }));
    fireEvent.keyDown(screen.getByRole("tab", { name: "지하철" }), {
      key: "ArrowLeft",
    });
    fireEvent.click(screen.getByRole("button", { name: "정류장 찾기" }));

    expect(onModeChange).toHaveBeenNthCalledWith(1, "subway");
    expect(onModeChange).toHaveBeenNthCalledWith(2, "bus");
    expect(onAdd).toHaveBeenCalledOnce();
  });
});
