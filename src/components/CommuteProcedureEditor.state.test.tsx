/** @vitest-environment jsdom */

import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CommuteProcedureEditor } from "./CommuteProcedureEditor";
import {
  companyPlace,
  homePlace,
} from "./CommuteProcedureEditor.test-fixtures";

describe("CommuteProcedureEditor state", () => {
  it("restores the initial draft without mutation when the user cancels", () => {
    // Given: an unsaved walk draft.
    const onSave = vi.fn();
    const onCancel = vi.fn();
    render(
      <CommuteProcedureEditor
        direction="company"
        place={companyPlace}
        procedure={null}
        onSave={onSave}
        onCancel={onCancel}
      />,
    );
    fireEvent.change(screen.getByLabelText("절차 이름"), {
      target: { value: "취소할 절차" },
    });
    fireEvent.click(screen.getByRole("button", { name: "도보 추가" }));

    // When: the user cancels instead of saving.
    fireEvent.click(screen.getByRole("button", { name: "편집 취소" }));

    // Then: no mutation is emitted and the local editor is reset.
    expect(onSave).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText("절차 이름")).toHaveValue("");
    expect(screen.queryByRole("listitem")).toBeNull();
  });

  it("restarts the draft with the current direction and place favorites", async () => {
    // Given: an editor started for the company collection.
    const onSave = vi.fn();
    const onCancel = vi.fn();
    const { rerender } = render(
      <CommuteProcedureEditor
        direction="company"
        place={companyPlace}
        procedure={null}
        onSave={onSave}
        onCancel={onCancel}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "버스 추가" }));
    expect(
      within(screen.getByLabelText("1번째 버스 서비스")).getByRole("option", {
        name: "341 · 강동공영차고지",
      }),
    ).toBeVisible();

    // When: the active commute direction changes to its isolated home place.
    rerender(
      <CommuteProcedureEditor
        direction="home"
        place={homePlace}
        procedure={null}
        onSave={onSave}
        onCancel={onCancel}
      />,
    );

    // Then: the stale company step is reset and only the home exact service is selectable.
    await waitFor(() => {
      expect(screen.queryByRole("listitem")).toBeNull();
    });
    fireEvent.click(screen.getByRole("button", { name: "버스 추가" }));
    const homeService = screen.getByLabelText("1번째 버스 서비스");
    expect(
      within(homeService).getByRole("option", { name: "342 · 집앞" }),
    ).toBeVisible();
    expect(
      within(homeService).queryByRole("option", {
        name: "341 · 강동공영차고지",
      }),
    ).toBeNull();
    expect(homeService).toHaveValue("");
  });
});

describe("CommuteProcedureEditor travel-time suggestions", () => {
  it("auto-fills walk and ride minutes from point geometry until the user edits them", async () => {
    // Given: a walk between the saved bus stop and subway station of the
    // company place (fixtures place them ~197 m apart).
    render(
      <CommuteProcedureEditor
        direction="company"
        place={companyPlace}
        procedure={null}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "버스 추가" }));
    fireEvent.click(screen.getByRole("button", { name: "도보 추가" }));
    fireEvent.click(screen.getByRole("button", { name: "지하철 추가" }));
    fireEvent.change(screen.getByLabelText("1번째 버스 서비스"), {
      target: { value: "fav-company-bus" },
    });
    fireEvent.change(screen.getByLabelText("3번째 지하철 서비스"), {
      target: { value: "fav-company-subway" },
    });

    // Then: the anchored legs fill from geometry (197 m walk → 3 min,
    // bus ride with detour → 2 min) and are marked as auto-calculated.
    await waitFor(() => {
      expect(screen.getByLabelText("2번째 도보 시간 (분)")).toHaveValue(3);
    });
    expect(screen.getByLabelText("1번째 버스 탑승 시간 (분)")).toHaveValue(2);
    expect(screen.getAllByText("거리 기준 자동 계산").length).toBeGreaterThan(0);
    // The last leg has no forward anchor and stays manual, with a hint.
    expect(screen.getByLabelText("3번째 지하철 탑승 시간 (분)")).toHaveValue(null);
    expect(screen.getByText("자동 계산 불가 · 직접 입력")).toBeVisible();

    // When: an adjacent walk is inserted, the stale auto value is cleared.
    fireEvent.click(screen.getByRole("button", { name: "도보 추가" }));
    fireEvent.click(screen.getByRole("button", { name: "4번째 도보 위로" }));
    await waitFor(() => {
      expect(screen.getByLabelText("2번째 도보 시간 (분)")).toHaveValue(null);
    });
    expect(screen.getByLabelText("3번째 도보 시간 (분)")).toHaveValue(null);
    expect(screen.getAllByText("자동 계산 불가 · 직접 입력").length).toBe(3);

    // When: the user overrides the walk, the value sticks and the note clears.
    fireEvent.change(screen.getByLabelText("2번째 도보 시간 (분)"), {
      target: { value: "7" },
    });
    await waitFor(() => {
      expect(screen.getByLabelText("2번째 도보 시간 (분)")).toHaveValue(7);
    });
    const walkField = screen
      .getByLabelText("2번째 도보 시간 (분)")
      .closest("label");
    expect(walkField).not.toBeNull();
    // The walk's auto-note is gone; the untouched bus ride keeps its note.
    expect(
      within(walkField ?? document.body).queryByText("거리 기준 자동 계산"),
    ).not.toBeInTheDocument();
    expect(
      within(
        screen.getByLabelText("1번째 버스 탑승 시간 (분)").closest("label") ??
          document.body,
      ).getByText("거리 기준 자동 계산"),
    ).toBeVisible();
  });
});
