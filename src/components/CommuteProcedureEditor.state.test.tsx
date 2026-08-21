/** @vitest-environment jsdom */

import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { legacyCommuteDraftSchema } from "../domain/commute";
import { CommuteProcedureEditor } from "./CommuteProcedureEditor";
import {
  companyBusFavorite,
  companyPlace,
  companyStation,
  companyStop,
  companySubwayFavorite,
  homePlace,
} from "./CommuteProcedureEditor.test-fixtures";

function completeLegacyMinutes() {
  fireEvent.change(screen.getByLabelText("절차 이름"), {
    target: { value: "이전 출근" },
  });
  fireEvent.change(screen.getByLabelText("1번째 버스 탑승 시간 (분)"), {
    target: { value: "18" },
  });
  fireEvent.change(screen.getByLabelText("1번째 버스 대기 대안 시간 (분)"), {
    target: { value: "5" },
  });
  fireEvent.change(screen.getByLabelText("2번째 지하철 탑승 시간 (분)"), {
    target: { value: "14" },
  });
  fireEvent.change(screen.getByLabelText("2번째 지하철 대기 대안 시간 (분)"), {
    target: { value: "3" },
  });
}

describe("CommuteProcedureEditor state", () => {
  it("completes a legacy draft only after exact favorites are selected for its preserved points", () => {
    // Given: a migrated draft retaining the old bus stop and subway station only.
    const onSave = vi.fn();
    const legacyDraft = legacyCommuteDraftSchema.parse({
      id: "legacy-route",
      kind: "legacy-draft",
      stopId: companyStop.id,
      stationId: companyStation.id,
    });
    render(
      <CommuteProcedureEditor
        direction="company"
        place={companyPlace}
        procedure={legacyDraft}
        onSave={onSave}
        onCancel={vi.fn()}
      />,
    );

    // When: the user selects exact favorites and supplies every required duration.
    expect(screen.getByText("설정 필요")).toBeVisible();
    expect(screen.getByText("천호역 정류장 · ARS 25014")).toBeVisible();
    expect(screen.getByText("천호역 · 5·8호선")).toBeVisible();
    expect(screen.getByRole("button", { name: "절차 저장" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("1번째 버스 서비스"), {
      target: { value: companyBusFavorite.id },
    });
    fireEvent.change(screen.getByLabelText("2번째 지하철 서비스"), {
      target: { value: companySubwayFavorite.id },
    });
    completeLegacyMinutes();
    fireEvent.click(screen.getByRole("button", { name: "절차 저장" }));

    // Then: saving emits a ready bus and subway procedure anchored to those saved point IDs.
    expect(onSave.mock.calls[0]?.[0]).toMatchObject({
      name: "이전 출근",
      steps: [
        { kind: "bus", stopId: companyStop.id, routeId: companyBusFavorite.routeId },
        {
          kind: "subway",
          stationId: companyStation.id,
          subwayId: companySubwayFavorite.subwayId,
        },
      ],
    });
  });

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
