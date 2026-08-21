/** @vitest-environment jsdom */

import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { CommuteDirection } from "../domain/bus";
import {
  busCommuteFavoriteSchema,
  commuteProcedureSchema,
  type SavedCommuteProcedure,
} from "../domain/commute";
import type { CommutePlace } from "../hooks/useCommuteStops";
import { CommuteProcedureEditor } from "./CommuteProcedureEditor";
import {
  companyBusFavorite,
  companyPlace,
  companyStop,
  companySubwayFavorite,
  createPlace,
} from "./CommuteProcedureEditor.test-fixtures";

function renderEditor(input: {
  readonly direction?: CommuteDirection;
  readonly place?: CommutePlace;
  readonly procedure?: SavedCommuteProcedure | null;
} = {}) {
  const onSave = vi.fn();
  const onCancel = vi.fn();
  const { rerender } = render(
    <CommuteProcedureEditor
      direction={input.direction ?? "company"}
      place={input.place ?? companyPlace}
      procedure={input.procedure ?? null}
      onSave={onSave}
      onCancel={onCancel}
    />,
  );
  return { onCancel, onSave, rerender };
}

describe("CommuteProcedureEditor", () => {
  it("adds, reorders, and removes ordered steps when editing a procedure", () => {
    // Given: an empty company procedure draft.
    renderEditor();

    // When: the user composes and rearranges three step kinds with named controls.
    fireEvent.click(screen.getByRole("button", { name: "도보 추가" }));
    fireEvent.click(screen.getByRole("button", { name: "버스 추가" }));
    fireEvent.click(screen.getByRole("button", { name: "지하철 추가" }));
    fireEvent.click(screen.getByRole("button", { name: "3번째 지하철 위로" }));
    fireEvent.click(screen.getByRole("button", { name: "2번째 지하철 단계 삭제" }));

    // Then: DOM and focus order follow the remaining walk, then bus sequence.
    const steps = screen.getAllByRole("listitem");
    expect(steps).toHaveLength(2);
    expect(within(steps[0] ?? document.body).getByText("도보")).toBeVisible();
    expect(within(steps[1] ?? document.body).getByText("버스")).toBeVisible();
    const moveButton = screen.getByRole("button", { name: "2번째 버스 위로" });
    moveButton.focus();
    expect(moveButton).toHaveFocus();
    expect(moveButton).toHaveAttribute("type", "button");
  });

  it("saves only the selected exact favorite identities when all fields are ready", () => {
    // Given: active-place bus and subway favorites with no service catalog.
    const { onSave } = renderEditor();
    fireEvent.change(screen.getByLabelText("절차 이름"), {
      target: { value: "아침 출근" },
    });
    fireEvent.click(screen.getByRole("button", { name: "도보 추가" }));
    fireEvent.click(screen.getByRole("button", { name: "버스 추가" }));
    fireEvent.click(screen.getByRole("button", { name: "지하철 추가" }));

    // When: the user chooses the saved exact services and enters complete durations.
    const busService = screen.getByLabelText("2번째 버스 서비스");
    expect(
      within(busService).getByRole("option", { name: "341 · 강동공영차고지" }),
    ).toBeVisible();
    expect(screen.queryByRole("textbox", { name: "2번째 버스 서비스" })).toBeNull();
    fireEvent.change(screen.getByLabelText("1번째 도보 시간 (분)"), {
      target: { value: "5" },
    });
    fireEvent.change(busService, { target: { value: companyBusFavorite.id } });
    fireEvent.change(screen.getByLabelText("2번째 버스 탑승 시간 (분)"), {
      target: { value: "18" },
    });
    fireEvent.change(screen.getByLabelText("2번째 버스 대기 대안 시간 (분)"), {
      target: { value: "5" },
    });
    fireEvent.change(screen.getByLabelText("3번째 지하철 서비스"), {
      target: { value: companySubwayFavorite.id },
    });
    fireEvent.change(screen.getByLabelText("3번째 지하철 탑승 시간 (분)"), {
      target: { value: "14" },
    });
    fireEvent.change(screen.getByLabelText("3번째 지하철 대기 대안 시간 (분)"), {
      target: { value: "3" },
    });
    const save = screen.getByRole("button", { name: "절차 저장" });
    expect(save).toBeEnabled();
    fireEvent.click(save);

    // Then: the ready input carries exact favorite keys rather than a typed display label.
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0]?.[0]).toMatchObject({
      name: "아침 출근",
      steps: [
        { kind: "walk", minutes: 5 },
        {
          kind: "bus",
          stopId: companyBusFavorite.stopId,
          arsId: companyBusFavorite.arsId,
          routeId: companyBusFavorite.routeId,
          direction: companyBusFavorite.direction,
          rideMinutes: 18,
          fallbackWaitMinutes: 5,
        },
        {
          kind: "subway",
          stationId: companySubwayFavorite.stationId,
          subwayId: companySubwayFavorite.subwayId,
          updnLine: companySubwayFavorite.updnLine,
          rideMinutes: 14,
          fallbackWaitMinutes: 3,
        },
      ],
    });
  });

  it("preserves an in-progress draft when a favorite is pinned within the same editor scope", () => {
    // Given: an in-progress company draft with a named walk and bus step.
    const { rerender } = renderEditor();
    const nameInput = screen.getByLabelText("절차 이름");
    fireEvent.change(nameInput, { target: { value: "아침 출근" } });
    fireEvent.click(screen.getByRole("button", { name: "도보 추가" }));
    fireEvent.click(screen.getByRole("button", { name: "버스 추가" }));
    fireEvent.change(screen.getByLabelText("1번째 도보 시간 (분)"), {
      target: { value: "5" },
    });

    // When: a new favorite is pinned while the editor stays open in the same
    // direction, place, and procedure scope.
    const extraBusFavorite = busCommuteFavoriteSchema.parse({
      id: "fav-company-bus-431",
      kind: "bus",
      stopId: companyStop.id,
      arsId: companyStop.arsId,
      routeId: "100100576",
      routeName: "431",
      direction: "잠실역",
      accessMinutes: 5,
    });
    rerender(
      <CommuteProcedureEditor
        direction="company"
        onCancel={vi.fn()}
        onSave={vi.fn()}
        place={createPlace({
          id: companyPlace.id,
          name: companyPlace.name,
          stops: companyPlace.stops,
          subwayStations: companyPlace.subwayStations,
          favorites: [...companyPlace.favorites, extraBusFavorite],
        })}
        procedure={null}
      />,
    );

    // Then: the same input node keeps the whole draft (no remount, no reset)
    // and the newly pinned exact service is immediately selectable.
    expect(screen.getByLabelText("절차 이름")).toBe(nameInput);
    expect(nameInput).toHaveValue("아침 출근");
    expect(screen.getByLabelText("1번째 도보 시간 (분)")).toHaveValue(5);
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(
      within(screen.getByLabelText("2번째 버스 서비스")).getByRole("option", {
        name: "431 · 잠실역",
      }),
    ).toBeVisible();
  });

  it("still resets to the stored procedure state when the editor scope changes", () => {
    // Given: an in-progress new draft for the company place.
    const savedProcedure = commuteProcedureSchema.parse({
      id: "proc-evening",
      kind: "ready",
      name: "퇴근길",
      steps: [
        { id: "saved-walk", kind: "walk", minutes: 4 },
        {
          id: "saved-bus",
          kind: "bus",
          stopId: companyBusFavorite.stopId,
          arsId: companyBusFavorite.arsId,
          routeId: companyBusFavorite.routeId,
          routeName: companyBusFavorite.routeName,
          direction: companyBusFavorite.direction,
          rideMinutes: 12,
          fallbackWaitMinutes: 6,
        },
      ],
    });
    const placeWithProcedure = {
      ...companyPlace,
      procedures: [savedProcedure],
    };
    const { rerender } = renderEditor({ place: placeWithProcedure });
    fireEvent.change(screen.getByLabelText("절차 이름"), {
      target: { value: "버려질 초안" },
    });

    // When: the editor reopens the saved procedure, changing the scope id.
    rerender(
      <CommuteProcedureEditor
        direction="company"
        onCancel={vi.fn()}
        onSave={vi.fn()}
        place={placeWithProcedure}
        procedure={savedProcedure satisfies SavedCommuteProcedure}
      />,
    );

    // Then: the draft is discarded and the saved procedure state is restored.
    expect(screen.getByLabelText("절차 이름")).toHaveValue("퇴근길");
    expect(screen.getByLabelText("1번째 도보 시간 (분)")).toHaveValue(4);
    expect(screen.getByLabelText("2번째 버스 서비스")).toHaveValue(
      companyBusFavorite.id,
    );
    expect(screen.getByLabelText("2번째 버스 탑승 시간 (분)")).toHaveValue(12);
    expect(screen.getByLabelText("2번째 버스 대기 대안 시간 (분)")).toHaveValue(6);
  });

  it("keeps save disabled with local integer and exact-service guidance when required data is invalid", () => {
    // Given: a place with a saved stop but no exact bus favorite.
    const placeWithoutFavorites = createPlace({
      id: "no-favorites",
      name: "회사",
      stops: companyPlace.stops,
      subwayStations: companyPlace.subwayStations,
      favorites: [],
    });
    renderEditor({ place: placeWithoutFavorites });
    fireEvent.click(screen.getByRole("button", { name: "도보 추가" }));
    fireEvent.click(screen.getByRole("button", { name: "버스 추가" }));

    // When: the user enters out-of-range and fractional minute values.
    fireEvent.change(screen.getByLabelText("1번째 도보 시간 (분)"), {
      target: { value: "0" },
    });

    // Then: field-local alerts explain the exact repair and link to the arrival rows.
    expect(screen.getAllByRole("alert").map((alert) => alert.textContent).join(" ")).toContain(
      "1번째 도보 시간",
    );
    expect(screen.getByRole("button", { name: "절차 저장" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("1번째 도보 시간 (분)"), {
      target: { value: "1.5" },
    });
    expect(screen.getAllByRole("alert").map((alert) => alert.textContent).join(" ")).toContain(
      "정수",
    );
    expect(screen.getByRole("link", { name: "도착 예정에서 즐겨찾기 저장" })).toHaveAttribute(
      "href",
      "#arrival-title",
    );
    expect(screen.getByText("즐겨찾기 없음")).toBeVisible();
  });
});
