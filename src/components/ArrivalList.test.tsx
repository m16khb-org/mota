// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { busStopSchema, normalizeArrivals } from "../domain/bus";
import { busCommuteFavoriteSchema } from "../domain/commute";
import { ArrivalList } from "./ArrivalList";

const arrivals = normalizeArrivals({
  resultList: [
    {
      busRouteId: "100100574",
      rtNm: "341",
      adirection: "강동공영차고지",
      arrmsg1: "5분 10초후[3번째 전]",
      arrmsg2: "12분후[8번째 전]",
      arrmsgSec1: "310",
      arrmsgSec2: "720",
      sectOrd1: "3",
      sectOrd2: "8",
      routeType: "간선",
      busType1: "1",
      congetion1: "4",
    },
  ],
});

describe("ArrivalList", () => {
  it("renders the observed bus identity and both arrival messages", () => {
    render(
      <ArrivalList
        arrivals={arrivals}
        loading={false}
        error={null}
        updatedAt="2026-08-20T03:10:20.000Z"
        hasStop
        onRefresh={vi.fn()}
      />,
    );

    expect(screen.getByText("341")).toBeInTheDocument();
    expect(screen.getByText("강동공영차고지")).toBeInTheDocument();
    expect(screen.getByText("5분")).toBeInTheDocument();
    expect(screen.getByText("5분 10초 후[3번째 전]")).toBeInTheDocument();
    expect(screen.getByText("다음 12분 후[8번째 전]")).toBeInTheDocument();
  });

  it("pins an observed bus row with its normalized exact service identity", () => {
    const onPinFavorite = vi.fn();
    const stop = busStopSchema.parse({
      id: "124000454",
      arsId: "25014",
      name: "천호역",
      lat: 37.5379,
      lng: 127.1255,
      distanceMeters: 151,
    });
    const observedArrivals = normalizeArrivals({
      resultList: [
        {
          busRouteId: "100100574",
          rtNm: "341",
          adirection: "  강동   공영차고지  ",
          arrmsg1: "5분후",
          arrmsg2: "",
          routeType: "간선",
          busType1: "0",
          congetion1: "0",
        },
        {
          busRouteId: "100100574",
          rtNm: "341",
          adirection: "반대편",
          arrmsg1: "7분후",
          arrmsg2: "",
          routeType: "간선",
          busType1: "0",
          congetion1: "0",
        },
      ],
    });
    render(
      <ArrivalList
        arrivals={observedArrivals}
        loading={false}
        error={null}
        updatedAt={null}
        hasStop
        onRefresh={vi.fn()}
        favoriteControls={{ stop, favorites: [], onPinFavorite, onUnpinFavorite: vi.fn() }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "341 강동 공영차고지 즐겨찾기 추가" }));

    expect(onPinFavorite).toHaveBeenCalledWith({
      kind: "bus",
      stopId: stop.id,
      arsId: stop.arsId,
      routeId: observedArrivals[0]?.routeId,
      routeName: "341",
      direction: "강동 공영차고지",
      accessMinutes: 5,
    });
  });

  it("unpins an already saved exact bus service instead of pinning it again", () => {
    const onPinFavorite = vi.fn();
    const onUnpinFavorite = vi.fn();
    const stop = busStopSchema.parse({
      id: "124000454",
      arsId: "25014",
      name: "천호역",
      lat: 37.5379,
      lng: 127.1255,
      distanceMeters: 151,
    });
    const pinnedFavorite = busCommuteFavoriteSchema.parse({
      id: "fav-341",
      kind: "bus",
      stopId: stop.id,
      arsId: stop.arsId,
      routeId: arrivals[0]?.routeId,
      routeName: "341",
      direction: "강동공영차고지",
      accessMinutes: 5,
    });
    render(
      <ArrivalList
        arrivals={arrivals}
        loading={false}
        error={null}
        updatedAt={null}
        hasStop
        onRefresh={vi.fn()}
        favoriteControls={{
          stop,
          favorites: [pinnedFavorite],
          onPinFavorite,
          onUnpinFavorite,
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "341 강동공영차고지 즐겨찾기 해제" }));

    expect(onPinFavorite).not.toHaveBeenCalled();
    expect(onUnpinFavorite).toHaveBeenCalledWith("fav-341");
  });

  it("calls refresh from the arrival control", () => {
    const onRefresh = vi.fn();
    render(
      <ArrivalList
        arrivals={arrivals}
        loading={false}
        error={null}
        updatedAt={null}
        hasStop
        onRefresh={onRefresh}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "도착정보 새로고침" }));

    expect(onRefresh).toHaveBeenCalledOnce();
  });
});
