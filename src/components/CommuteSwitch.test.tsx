// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CommuteSwitch } from "./CommuteSwitch";

describe("CommuteSwitch", () => {
  it("moves focus and selection with arrow keys", () => {
    const onChange = vi.fn();
    render(<CommuteSwitch value="company" onChange={onChange} />);

    const companyTab = screen.getByRole("tab", { name: "회사로" });
    const homeTab = screen.getByRole("tab", { name: "집으로" });
    companyTab.focus();
    fireEvent.keyDown(companyTab, { key: "ArrowRight" });

    expect(homeTab).toHaveFocus();
    expect(onChange).toHaveBeenCalledWith("home");
    expect(companyTab).toHaveAttribute("tabindex", "0");
    expect(homeTab).toHaveAttribute("tabindex", "-1");
  });

  it("links each tab to the commute panel", () => {
    render(<CommuteSwitch value="home" onChange={vi.fn()} />);

    expect(screen.getByRole("tab", { name: "집으로" })).toHaveAttribute(
      "aria-controls",
      "commute-panel",
    );
  });
});
