// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { normalizeArrivals } from "../domain/bus";
import { ArrivalList } from "./ArrivalList";

const arrivals = normalizeArrivals({
  resultList: [
    {
      busRouteId: "100100574",
      rtNm: "341",
      adirection: "강동공영차고지",
      arrmsg1: "5분 10초후[3번째 전]",
      arrmsg2: "12분후[8번째 전]",
      routeType: "간선",
      busType1: "1",
      congetion1: "4",
    },
  ],
});

describe("ArrivalList", () => {
  it("shows at most the next three bus rows", () => {
    const fourArrivals = normalizeArrivals({
      resultList: [1, 2, 3, 4].map((minutes) => ({
        busRouteId: `route-${minutes}`,
        rtNm: `${minutes}번`,
        adirection: "차고지 방면",
        arrmsg1: `${minutes}분 후`,
        arrmsg2: "",
        routeType: "간선",
        busType1: "0",
        congetion1: "0",
      })),
    });

    render(
      <ArrivalList
        stopName="천호역"
        arrivals={fourArrivals}
        loading={false}
        error={null}
        updatedAt={null}
        hasStop
        onRefresh={vi.fn()}
      />,
    );

    expect(screen.getByText("1번")).toBeInTheDocument();
    expect(screen.getByText("2번")).toBeInTheDocument();
    expect(screen.getByText("3번")).toBeInTheDocument();
    expect(screen.queryByText("4번")).not.toBeInTheDocument();
  });

  it("renders the stop, direction, and both bus estimates", () => {
    render(
      <ArrivalList
        stopName="천호역"
        arrivals={arrivals}
        loading={false}
        error={null}
        updatedAt="2026-08-20T03:10:20.000Z"
        hasStop
        onRefresh={vi.fn()}
      />,
    );

    expect(screen.getByText("천호역 다음 버스")).toBeInTheDocument();
    expect(screen.getByText("341")).toBeInTheDocument();
    expect(screen.getByText("강동공영차고지")).toBeInTheDocument();
    expect(screen.getByText("5분")).toBeInTheDocument();
    expect(screen.getByText("다음 12분 후[8번째 전]")).toBeInTheDocument();
  });

  it("calls refresh from the arrival control", () => {
    const onRefresh = vi.fn();
    render(
      <ArrivalList
        stopName="천호역"
        arrivals={arrivals}
        loading={false}
        error={null}
        updatedAt={null}
        hasStop
        onRefresh={onRefresh}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "천호역 버스 도착정보 새로고침" }),
    );

    expect(onRefresh).toHaveBeenCalledOnce();
  });

  it("keeps retry available after a failed refresh", () => {
    const onRefresh = vi.fn();
    render(
      <ArrivalList
        stopName="천호역"
        arrivals={arrivals}
        loading={false}
        error="도착 정보를 불러오지 못했습니다."
        updatedAt={null}
        hasStop
        onRefresh={onRefresh}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));

    expect(onRefresh).toHaveBeenCalledOnce();
    expect(screen.getByText("341")).toBeInTheDocument();
  });
});
