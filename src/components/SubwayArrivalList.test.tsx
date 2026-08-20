// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { SubwayArrival } from "../domain/subway";
import { SubwayArrivalList } from "./SubwayArrivalList";

const arrivals: readonly SubwayArrival[] = [
  {
    id: "1002-하행-강남방면",
    line: "2호선",
    direction: "강남방면",
    trainStatus: "일반",
    seconds: 45,
    message: "전역 출발",
    location: "을지로",
    isLastTrain: false,
  },
  {
    id: "1001-상행-양주행",
    line: "1호선",
    direction: "양주행 - 종각방면",
    trainStatus: "급행",
    seconds: null,
    message: "운행 종료",
    location: null,
    isLastTrain: true,
  },
];

describe("SubwayArrivalList", () => {
  it("renders line badges, ETAs, and last-train marks", () => {
    render(
      <SubwayArrivalList
        stationName="천호"
        arrivals={arrivals}
        loading={false}
        error={null}
        updatedAt="2026-08-20T03:10:20.000Z"
        onClose={vi.fn()}
        onRefresh={vi.fn()}
      />,
    );

    expect(screen.getByText("천호 도착 예정")).toBeInTheDocument();
    expect(screen.getByText("12:10 기준")).toBeInTheDocument();
    expect(screen.getByText("2호선")).toBeInTheDocument();
    expect(screen.getByText("곧 도착")).toBeInTheDocument();
    expect(screen.getByText("막차")).toBeInTheDocument();
    expect(screen.getByText("정보 없음")).toBeInTheDocument();
  });

  it("exposes retry when loading fails", () => {
    const onRefresh = vi.fn();
    render(
      <SubwayArrivalList
        stationName="천호"
        arrivals={[]}
        loading={false}
        error="지하철 도착 정보를 불러오지 못했습니다."
        updatedAt={null}
        onClose={vi.fn()}
        onRefresh={onRefresh}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(onRefresh).toHaveBeenCalled();
  });
});
