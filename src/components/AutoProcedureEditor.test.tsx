/** @vitest-environment jsdom */

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { CommuteProcedureInput } from "../hooks/useCommuteProcedures";
import { AutoProcedureEditor } from "./AutoProcedureEditor";
import {
  companyPlace,
  companyStation,
  companyStop,
} from "./CommuteProcedureEditor.test-fixtures";

function renderEditor() {
  const onSave = vi.fn();
  render(
    <AutoProcedureEditor
      place={companyPlace}
      procedure={null}
      onSave={onSave}
      onCancel={vi.fn()}
    />,
  );
  return { onSave };
}

describe("AutoProcedureEditor", () => {
  it("composes an ordered itinerary from saved points with zero service choices", () => {
    const { onSave } = renderEditor();

    fireEvent.click(
      screen.getByRole("button", { name: `천호역 정류장 · ARS ${companyStop.arsId} 경유지 추가` }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: `천호역 · ${companyStation.line} 경유지 추가` }),
    );
    fireEvent.change(screen.getByLabelText("절차 이름"), {
      target: { value: "아침" },
    });

    // Reorder: station moves first.
    fireEvent.click(screen.getByRole("button", { name: "2번째 경유지 위로" }));
    expect(
      screen.getByRole("heading", { name: "1 지하철역" }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "절차 저장" }));

    expect(onSave).toHaveBeenCalledTimes(1);
    const saved = onSave.mock.calls[0]?.[0] as CommuteProcedureInput;
    expect(saved.kind).toBe("auto");
    if (saved.kind === "auto") {
      expect(saved.name).toBe("아침");
      expect(saved.points).toEqual([
        { type: "station", stationId: companyStation.id, apiStationName: "천호" },
        { type: "stop", stopId: companyStop.id, arsId: companyStop.arsId },
      ]);
    }
  });

  it("keeps save disabled until a name and at least two waypoints exist", () => {
    const { onSave } = renderEditor();

    const save = screen.getByRole("button", { name: "절차 저장" });
    expect(save).toBeDisabled();
    fireEvent.click(
      screen.getByRole("button", { name: `천호역 정류장 · ARS ${companyStop.arsId} 경유지 추가` }),
    );
    expect(save).toBeDisabled();
    fireEvent.change(screen.getByLabelText("절차 이름"), {
      target: { value: "이름만" },
    });
    expect(save).toBeDisabled();
    fireEvent.click(
      screen.getByRole("button", { name: `천호역 · ${companyStation.line} 경유지 추가` }),
    );
    expect(save).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "절차 저장" }));
    expect(onSave).toHaveBeenCalledTimes(1);
  });
});
