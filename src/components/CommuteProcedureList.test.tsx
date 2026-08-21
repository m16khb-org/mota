// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { CommutePlace } from "../hooks/useCommuteStops";
import { CommuteProcedureList } from "./CommuteProcedureList";

const place: CommutePlace = {
  id: "company-1",
  name: "회사",
  stops: [],
  subwayStations: [],
  selectedStopId: null,
  routeOptions: [],
  activeRouteOptionId: null,
  procedures: [
    {
      id: "proc-a" as never,
      kind: "ready",
      name: "출근 루틴",
      steps: [{ id: "s1" as never, kind: "walk", minutes: 3 }],
    },
    {
      id: "proc-b" as never,
      kind: "ready",
      name: "퇴근 루틴",
      steps: [{ id: "s2" as never, kind: "walk", minutes: 5 }],
    },
  ],
  favorites: [],
  activeProcedureId: "proc-a" as never,
} as unknown as CommutePlace;

function renderList() {
  const onSelect = vi.fn();
  render(
    <CommuteProcedureList
      place={place}
      onAdd={vi.fn()}
      onEdit={vi.fn()}
      onSelect={onSelect}
      onRemove={vi.fn()}
      onReorder={vi.fn()}
    />,
  );
  return { onSelect };
}

describe("CommuteProcedureList", () => {
  it("renders the four controls as accessible 44px-minimum buttons", () => {
    renderList();

    for (const label of [
      "출근 루틴 절차 위로",
      "출근 루틴 절차 아래로",
      "출근 루틴 절차 편집",
      "출근 루틴 절차 삭제",
    ]) {
      const button = screen.getByRole("button", { name: label });
      expect(button).toBeInTheDocument();
      expect(button.tagName).toBe("BUTTON");
    }
  });

  it("selects the row through the main button", () => {
    const { onSelect } = renderList();

    fireEvent.click(
      screen.getByRole("button", {
        name: /출근 루틴 1단계 · 도보/,
      }),
    );
    expect(onSelect).toHaveBeenCalledWith("proc-a");
  });

  it("enforces the 44px stacked control contract at <=480px in the shipped stylesheet", async () => {
    // Closest machine-consumed seam for a layout fact: the shipped CSS. At
    // <=480px the procedure row stacks and `.procedure-row-controls
    // .icon-button` must declare an explicit 44px minimum height — an
    // inherited `height: 100%` collapses to the 20px icon height in the
    // auto-height control row (the 44x20 regression).
    const { readFile } = await import("node:fs/promises");
    const { resolve } = await import("node:path");
    const css = await readFile(resolve(process.cwd(), "src/styles.css"), "utf8");

    const compact = css.match(
      /@media \(max-width: 480px\) \{([\s\S]*?)\n\}/,
    );
    expect(compact).not.toBeNull();
    const block = compact?.[1] ?? "";

    const controlRule = block.match(
      /\.procedure-row-controls \.icon-button \{([\s\S]*?)\}/,
    );
    expect(controlRule).not.toBeNull();
    const declarations = controlRule?.[1] ?? "";

    // The mobile control rule must not fall back to the indefinite 100%.
    expect(declarations).not.toMatch(/height:\s*100%/);
    // It must pin the minimum target: min-height 44px (with or without an
    // explicit height), never smaller.
    expect(declarations).toMatch(/min-height:\s*44px/);
    const height = declarations.match(/(?:^|\s)height:\s*([0-9]+)px/);
    if (height) {
      expect(Number(height[1])).toBeGreaterThanOrEqual(44);
    }
  });
});
