// @vitest-environment jsdom

import type { TransitSelections } from "@mota/contracts/transit-settings";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CommuteContextSelector } from "./CommuteContextSelector";

const commutes: TransitSelections["commutes"] = {
  toWork: {
    busStops: [],
    subwayStations: [],
    selectedBusStopIds: [],
    selectedSubwayStationId: null,
  },
  toHome: {
    busStops: [],
    subwayStations: [],
    selectedBusStopIds: [],
    selectedSubwayStationId: null,
  },
};

describe("CommuteContextSelector", () => {
  it("keeps the two commute contexts independently addressable by tabs", () => {
    const onChange = vi.fn();
    render(
      <CommuteContextSelector
        activeContext="toWork"
        commutes={commutes}
        onChange={onChange}
      />,
    );

    const work = screen.getByRole("tab", { name: "출근" });
    const home = screen.getByRole("tab", { name: "퇴근" });
    expect(work).toHaveAttribute("data-commute-context", "toWork");
    expect(home).toHaveAttribute("data-commute-context", "toHome");
    expect(work).toHaveAttribute("aria-selected", "true");
    expect(home).toHaveAttribute("aria-selected", "false");

    fireEvent.keyDown(work, { key: "ArrowRight" });

    expect(onChange).toHaveBeenCalledWith("toHome");
    expect(home).toHaveFocus();
  });
});
