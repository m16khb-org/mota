// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { subwayCommuteFavoriteSchema } from "../domain/commute";
import {
  subwayStationSchema,
  type SubwayArrival,
} from "../domain/subway";
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
    direction: "양주행 - 종각방면",
    trainLineNm: "양주행 - 종각방면",
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

  it("pins the observed subway stable key even when display labels match", () => {
    const onPinFavorite = vi.fn();
    const station = subwayStationSchema.parse({
      id: "osm-node-5801572034",
      name: "천호",
      line: "2호선",
      lat: 37.5385,
      lng: 127.1234,
      distanceMeters: 228,
    });
    const matchingDisplay: readonly SubwayArrival[] = [
      ...arrivals,
      {
        id: "1008-하행-강남방면",
        subwayId: "1008",
        updnLine: "하행",
        line: "2호선",
        direction: "강남방면",
        trainLineNm: "강남방면",
        trainStatus: "일반",
        seconds: 180,
        message: "3분 후",
        location: null,
        isLastTrain: false,
      },
    ];
    render(
      <SubwayArrivalList
        stationName="천호"
        arrivals={matchingDisplay}
        loading={false}
        error={null}
        updatedAt={null}
        onClose={vi.fn()}
        onRefresh={vi.fn()}
        favoriteControls={{
          station,
          apiStationName: "천호(풍납토성)",
          favorites: [],
          onPinFavorite,
          onUnpinFavorite: vi.fn(),
        }}
      />,
    );

    const pinControls = screen.getAllByRole("button", {
      name: "2호선 · 강남방면 즐겨찾기 추가",
    });
    const matchingLinePin = pinControls[1];
    if (matchingLinePin === undefined) {
      throw new TypeError("Expected a second matching subway pin control");
    }
    fireEvent.click(matchingLinePin);

    expect(onPinFavorite).toHaveBeenCalledWith({
      kind: "subway",
      stationId: station.id,
      apiStationName: "천호(풍납토성)",
      subwayId: "1008",
      updnLine: "하행",
      lineName: "2호선",
      trainLineNm: "강남방면",
      accessMinutes: 5,
    });
  });

  it("does not unpin a same-key favorite from another API station context", () => {
    const onPinFavorite = vi.fn();
    const onUnpinFavorite = vi.fn();
    const station = subwayStationSchema.parse({ id: "osm-node-5801572034", name: "천호", line: "2호선", lat: 37.5385, lng: 127.1234, distanceMeters: 228 });
    render(
      <SubwayArrivalList
        stationName="천호"
        arrivals={arrivals}
        loading={false}
        error={null}
        updatedAt={null}
        onClose={vi.fn()}
        onRefresh={vi.fn()}
        favoriteControls={{ station, apiStationName: "천호", favorites: [subwayCommuteFavoriteSchema.parse({ id: "other-context", kind: "subway", stationId: station.id, apiStationName: "천호(풍납토성)", subwayId: "1002", updnLine: "하행", lineName: "2호선", trainLineNm: "강남방면", accessMinutes: 5 })], onPinFavorite, onUnpinFavorite }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "2호선 · 강남방면 즐겨찾기 추가" }));

    expect(onPinFavorite).toHaveBeenCalledOnce();
    expect(onUnpinFavorite).not.toHaveBeenCalled();
  });

  it("calls the explicit refresh and close controls", () => {
    const onClose = vi.fn();
    const onRefresh = vi.fn();
    render(
      <SubwayArrivalList
        stationName="천호"
        arrivals={arrivals}
        loading={false}
        error={null}
        updatedAt={null}
        onClose={onClose}
        onRefresh={onRefresh}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "지하철 도착정보 새로고침" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "지하철 도착정보 닫기" }),
    );

    expect(onRefresh).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
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
