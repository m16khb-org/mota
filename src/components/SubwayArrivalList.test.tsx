// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { SubwayArrival } from "../domain/subway";
import { SubwayArrivalList } from "./SubwayArrivalList";

const arrivals: readonly SubwayArrival[] = [
  {
    id: "1002-하행-강남방면",
    subwayId: "1002",
    updnLine: "하행",
    line: "2호선",
    direction: "강남방면",
    trainLineNm: "강남방면",
    trainStatus: "일반",
    seconds: 45,
    message: "전역 출발",
    location: "을지로",
    isLastTrain: false,
  },
  {
    id: "1001-상행-양주행",
    subwayId: "1001",
    updnLine: "상행",
    line: "1호선",
    direction: "양주행",
    trainLineNm: "양주행",
    trainStatus: "급행",
    seconds: null,
    message: "운행 종료",
    location: null,
    isLastTrain: true,
  },
];

describe("SubwayArrivalList", () => {
  it("filters one direction and shows at most its next three trains", () => {
    const directionalArrivals: readonly SubwayArrival[] = [
      ...[1, 2, 3, 4].map(
        (minutes): SubwayArrival => ({
          id: `1008-상행-${minutes}`,
          subwayId: "1008",
          updnLine: "상행",
          line: "8호선",
          direction: "암사행",
          trainLineNm: "암사행",
          trainStatus: "일반",
          seconds: minutes * 60,
          message: `${minutes}분 후`,
          location: null,
          isLastTrain: false,
        }),
      ),
      {
        id: "1008-하행-1",
        subwayId: "1008",
        updnLine: "하행",
        line: "8호선",
        direction: "모란행",
        trainLineNm: "모란행",
        trainStatus: "일반",
        seconds: 30,
        message: "곧 도착",
        location: null,
        isLastTrain: false,
      },
    ];

    render(
      <SubwayArrivalList
        stationName="천호"
        arrivals={directionalArrivals}
        loading={false}
        error={null}
        updatedAt={null}
        onRefresh={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("tablist", { name: "지하철 방향 선택" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "8호선 상행" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByText("1분")).toBeInTheDocument();
    expect(screen.getByText("2분")).toBeInTheDocument();
    expect(screen.getByText("3분")).toBeInTheDocument();
    expect(screen.queryByText("4분")).not.toBeInTheDocument();
    expect(screen.queryByText("곧 도착")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "8호선 하행" }));

    expect(screen.getAllByText("곧 도착")).toHaveLength(2);
    expect(screen.queryByText("1분")).not.toBeInTheDocument();
  });

  it("renders line, destination, status, and last-train details", () => {
    render(
      <SubwayArrivalList
        stationName="천호"
        arrivals={arrivals}
        loading={false}
        error={null}
        updatedAt="2026-08-20T03:10:20.000Z"
        onRefresh={vi.fn()}
      />,
    );

    expect(screen.getByText("천호 도착 예정")).toBeInTheDocument();
    expect(screen.getByText("2호선")).toBeInTheDocument();
    expect(screen.getByText("강남방면")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "1호선 상행" }));

    expect(screen.getByText("막차")).toBeInTheDocument();
    expect(screen.getByText("정보 없음")).toBeInTheDocument();
  });

  it("calls the explicit refresh control", () => {
    const onRefresh = vi.fn();
    render(
      <SubwayArrivalList
        stationName="천호"
        arrivals={arrivals}
        loading={false}
        error={null}
        updatedAt={null}
        onRefresh={onRefresh}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "지하철 도착정보 새로고침" }),
    );

    expect(onRefresh).toHaveBeenCalledOnce();
  });

  it("keeps retry available after a failed refresh", () => {
    const onRefresh = vi.fn();
    render(
      <SubwayArrivalList
        stationName="천호"
        arrivals={arrivals}
        loading={false}
        error="지하철 도착 정보를 불러오지 못했습니다."
        updatedAt={null}
        onRefresh={onRefresh}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));

    expect(onRefresh).toHaveBeenCalledOnce();
    expect(screen.getByText("강남방면")).toBeInTheDocument();
  });
});
