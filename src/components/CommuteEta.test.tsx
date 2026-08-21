// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { normalizeArrivals } from "../domain/bus";
import {
  busCommuteStepSchema,
  commuteProcedureSchema,
  subwayCommuteStepSchema,
} from "../domain/commute";
import { type CommuteEstimate, estimateCommuteProcedure } from "../domain/commuteEstimate";
import { normalizeSubwayArrivals } from "../domain/subway";
import { CommuteEta } from "./CommuteEta";

const now = Date.UTC(2026, 7, 20, 0, 50);

const busStep = busCommuteStepSchema.parse({
  id: "bus-341",
  kind: "bus",
  stopId: "124000454",
  arsId: "25014",
  routeId: "100100574",
  routeName: "341",
  direction: "강동공영차고지",
  rideMinutes: 18,
  fallbackWaitMinutes: 7,
});

const subwayStep = subwayCommuteStepSchema.parse({
  id: "subway-2",
  kind: "subway",
  stationId: "osm-node-2095165702",
  apiStationName: "천호(풍납토성)",
  subwayId: "1002",
  updnLine: "하행",
  lineName: "2호선",
  trainLineNm: "강남방면",
  rideMinutes: 22,
  fallbackWaitMinutes: 6,
});

const procedure = commuteProcedureSchema.parse({
  id: "morning-commute",
  kind: "ready",
  name: "아침 출근",
  steps: [
    { id: "walk-out", kind: "walk", minutes: 4 },
    busStep,
    { id: "walk-transfer", kind: "walk", minutes: 3 },
    subwayStep,
    { id: "walk-destination", kind: "walk", minutes: 4 },
  ],
});

function busArrival(firstSeconds: number): ReturnType<typeof normalizeArrivals>[number] {
  const [arrival] = normalizeArrivals({
    resultList: [
      {
        busRouteId: busStep.routeId,
        rtNm: busStep.routeName,
        adirection: busStep.direction,
        arrmsg1: `${firstSeconds}초 후`,
        arrmsg2: "운행 종료",
      },
    ],
  });
  if (arrival === undefined) {
    throw new Error("Bus arrival fixture was not normalized");
  }
  return arrival;
}

function subwayArrival(
  seconds: number,
): ReturnType<typeof normalizeSubwayArrivals>["arrivals"][number] {
  const [arrival] = normalizeSubwayArrivals({
    realtimeArrivalList: [
      {
        subwayId: subwayStep.subwayId,
        updnLine: subwayStep.updnLine,
        trainLineNm: subwayStep.trainLineNm,
        barvlDt: String(seconds),
        arvlMsg2: `${seconds}초 후`,
        recptnDt: "2026-08-20 09:50:00",
      },
    ],
  }).arrivals;
  if (arrival === undefined) {
    throw new Error("Subway arrival fixture was not normalized");
  }
  return arrival;
}

function estimate(
  options: {
    readonly busSeconds?: number;
    readonly subwaySeconds?: number;
    readonly busSuccessAt?: number | null;
    readonly busFailed?: boolean;
    readonly blockedSubway?: boolean;
    readonly withoutSubwaySource?: boolean;
  } = {},
): CommuteEstimate {
  const steps = options.blockedSubway
    ? procedure.steps.map((step) => {
        switch (step.kind) {
          case "walk":
          case "bus":
            return step;
          case "subway": {
            const { fallbackWaitMinutes: _fallbackWaitMinutes, ...withoutFallback } = step;
            return withoutFallback;
          }
          default:
            throw new TypeError(`Unexpected commute step: ${String(step)}`);
        }
      })
    : procedure.steps;
  return estimateCommuteProcedure({
    procedure: { id: procedure.id, steps },
    now,
    busArrivals: [
      {
        stopId: busStep.stopId,
        arrivals: [busArrival(options.busSeconds ?? 300)],
        successAt: options.busSuccessAt === undefined ? now : options.busSuccessAt,
        latestAttemptFailed: options.busFailed ?? false,
      },
    ],
    ...(options.withoutSubwaySource
      ? {}
      : {
          subwayArrivals: [
            {
              stationId: subwayStep.stationId,
              arrivals: [subwayArrival(options.subwaySeconds ?? 1_680)],
              successAt: now,
              latestAttemptFailed: false,
            },
          ],
        }),
  });
}

function expectHeaderTime(label: string, value: string): void {
  expect(screen.getByText(label).parentElement).toHaveTextContent(value);
}

function renderEta(
  options: { readonly result?: CommuteEstimate; readonly refreshing?: boolean } = {},
) {
  const onEditProcedure = vi.fn();
  const onRefresh = vi.fn();
  const result = options.result ?? estimate();

  const view = render(
    <CommuteEta
      procedure={procedure}
      result={result}
      refreshing={options.refreshing ?? false}
      onEditProcedure={onEditProcedure}
      onRefresh={onRefresh}
    />,
  );

  return { ...view, onEditProcedure, onRefresh };
}

describe("CommuteEta", () => {
  it("renders mixed live and estimated steps with live leave guidance and a destination ETA", () => {
    renderEta();

    expect(screen.getByRole("heading", { name: "아침 출근" })).toBeVisible();
    expectHeaderTime("출발 안내", "09:51까지 출발");
    expectHeaderTime("도착 예정", "10:44 도착");
    expect(screen.getAllByText("실시간")).toHaveLength(2);
    expect(screen.getAllByText("예상")).toHaveLength(3);
    expect(screen.getByText(/341번 버스/)).toBeVisible();
    expect(screen.getByText(/2호선 강남방면/)).toBeVisible();
  });

  it("moves the destination time when a live boarding result changes", () => {
    const { rerender } = renderEta({ result: estimate() });
    expectHeaderTime("도착 예정", "10:44 도착");

    rerender(
      <CommuteEta
        procedure={procedure}
        result={estimate({ busSeconds: 600, subwaySeconds: 2_400 })}
        refreshing={false}
        onEditProcedure={vi.fn()}
        onRefresh={vi.fn()}
      />,
    );

    expectHeaderTime("도착 예정", "10:56 도착");
    expect(screen.queryByText("10:44 도착")).not.toBeInTheDocument();
  });

  it("gives each instance its own heading relationship", () => {
    const result = estimate();
    render(
      <>
        <CommuteEta
          procedure={procedure}
          result={result}
          refreshing={false}
          onEditProcedure={vi.fn()}
          onRefresh={vi.fn()}
        />
        <CommuteEta
          procedure={procedure}
          result={result}
          refreshing={false}
          onEditProcedure={vi.fn()}
          onRefresh={vi.fn()}
        />
      </>,
    );

    const sections = [...document.querySelectorAll<HTMLElement>(".commute-eta")];
    expect(sections).toHaveLength(2);
    const headingIds = sections.map((section) => {
      const headingId = section.getAttribute("aria-labelledby");
      expect(headingId).not.toBeNull();
      expect(section.querySelector("h2")?.id).toBe(headingId);
      return headingId;
    });

    expect(new Set(headingIds).size).toBe(2);
  });

  it("keeps the previous result visible while refreshing", () => {
    renderEta({ refreshing: true });

    expect(screen.getByText(/정보 갱신 중/)).toBeVisible();
    expectHeaderTime("출발 안내", "09:51까지 출발");
    expectHeaderTime("도착 예정", "10:44 도착");
    expect(screen.getByText(/정보 갱신 중/).closest("p")).toHaveAttribute("aria-live", "polite");
    expect(document.querySelectorAll("[aria-live='polite']")).toHaveLength(1);
  });

  it("keeps the calculated prefix and exposes edit and retry actions when a step is blocked", () => {
    const { onEditProcedure, onRefresh } = renderEta({
      result: estimate({ blockedSubway: true, withoutSubwaySource: true }),
    });

    expectHeaderTime("출발 안내", "09:51까지 출발");
    expect(screen.queryByText("도착 예정")).not.toBeInTheDocument();
    expect(screen.getAllByText("정보 없음")).toHaveLength(2);
    expect(screen.getByText("이후 단계의 출발 시간을 정할 수 없습니다.")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "경로 수정" }));
    fireEvent.click(screen.getByRole("button", { name: "다시 확인" }));
    expect(onEditProcedure).toHaveBeenCalledOnce();
    expect(onRefresh).toHaveBeenCalledOnce();
  });

  it("labels a fallback transfer as estimated without claiming a fully live commute", () => {
    renderEta({ result: estimate({ subwaySeconds: 60 }) });

    expectHeaderTime("도착 예정", "10:48 도착");
    expect(screen.getAllByText("예상")).toHaveLength(4);
    expect(screen.queryByText("전체 실시간")).not.toBeInTheDocument();
  });

  it("suppresses leave guidance for offline estimated totals and shows stale and unavailable bases", () => {
    const offline = estimate({
      busSuccessAt: null,
      busFailed: true,
      withoutSubwaySource: true,
    });
    const { rerender } = renderEta({ result: offline });

    expectHeaderTime("도착 예정", "10:54 도착");
    expect(screen.queryByText("출발 안내")).not.toBeInTheDocument();
    expect(screen.getAllByText("정보 없음")).toHaveLength(2);
    expect(screen.getByText("저장한 이동 시간과 대기 시간으로 계산했습니다.")).toBeVisible();

    const stale = estimate({ busSuccessAt: now - 91_000, subwaySeconds: 60 });
    rerender(
      <CommuteEta
        procedure={procedure}
        result={stale}
        refreshing={false}
        onEditProcedure={vi.fn()}
        onRefresh={vi.fn()}
      />,
    );
    expect(screen.getByText("오래됨")).toBeVisible();
  });

  it("uses concise accessible controls and removes the old rank copy", () => {
    renderEta({ result: estimate({ blockedSubway: true, withoutSubwaySource: true }) });

    expect(screen.getByRole("button", { name: "경로 수정" })).toBeVisible();
    expect(screen.getByRole("button", { name: "다시 확인" })).toBeVisible();
    expect(screen.queryByText("지금 출발 추천")).not.toBeInTheDocument();
    expect(screen.queryByText("1순위")).not.toBeInTheDocument();
  });
});
