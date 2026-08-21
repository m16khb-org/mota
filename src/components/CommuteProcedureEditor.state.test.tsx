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
