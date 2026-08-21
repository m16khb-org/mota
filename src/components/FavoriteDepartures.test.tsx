// @vitest-environment jsdom

import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { busStopSchema, normalizeArrivals } from "../domain/bus";
import { busCommuteFavoriteSchema, subwayCommuteFavoriteSchema, type BusCommuteFavorite } from "../domain/commute";
import type { LiveSnapshot } from "../domain/liveCommuteQueries";
import { subwayStationSchema, type SubwayArrival } from "../domain/subway";
import { FavoriteDepartures } from "./FavoriteDepartures";

const NOW = Date.UTC(2026, 7, 20, 3, 10);
const stop = busStopSchema.parse({
  id: "124000454",
  arsId: "25014",
  name: "천호역",
  lat: 37.5379,
  lng: 127.1255,
  distanceMeters: 151,
});
const station = subwayStationSchema.parse({
  id: "osm-node-5801572034",
  name: "천호",
  line: "2호선",
  lat: 37.5385,
  lng: 127.1234,
  distanceMeters: 228,
});
const busFavorite = busCommuteFavoriteSchema.parse({
  id: "fav-bus",
  kind: "bus",
  stopId: stop.id,
  arsId: stop.arsId,
  routeId: "100100574",
  routeName: "341",
  direction: "강동공영차고지",
  accessMinutes: 1,
});
const subwayFavorite = subwayCommuteFavoriteSchema.parse({
  id: "fav-subway",
  kind: "subway",
  stationId: station.id,
  apiStationName: "천호(풍납토성)",
  subwayId: "1002",
  updnLine: "하행",
  lineName: "2호선",
  trainLineNm: "강남방면",
  accessMinutes: 3,
});
type TestFavorite = typeof busFavorite | typeof subwayFavorite;

const busArrivals = normalizeArrivals({
  resultList: [
    {
      busRouteId: "100100574",
      rtNm: "341",
      adirection: "강동공영차고지",
      arrmsg1: "10분후",
      arrmsg2: "2분후",
      routeType: "간선",
      busType1: "0",
      congetion1: "0",
    },
    {
      busRouteId: "100100574",
      rtNm: "341",
      adirection: "반대편",
      arrmsg1: "30초후",
      arrmsg2: "",
      routeType: "간선",
      busType1: "0",
      congetion1: "0",
    },
    {
      busRouteId: "100500001",
      rtNm: "351",
      adirection: "강동공영차고지",
      arrmsg1: "1분후",
      arrmsg2: "",
      routeType: "간선",
      busType1: "0",
      congetion1: "0",
    },
  ],
});
const subwayArrivals: readonly SubwayArrival[] = [
  {
    id: "1008-하행-강남방면",
    subwayId: "1008",
    updnLine: "하행",
    line: "2호선",
    direction: "강남방면",
    trainLineNm: "강남방면",
    trainStatus: "일반",
    seconds: 30,
    message: "곧 도착",
    location: null,
    isLastTrain: false,
  },
  {
    id: "1002-하행-강남방면-4",
    subwayId: "1002",
    updnLine: "하행",
    line: "2호선",
    direction: "강남방면",
    trainLineNm: "강남방면",
    trainStatus: "일반",
    seconds: 240,
    message: "4분 후",
    location: null,
    isLastTrain: false,
  },
  {
    id: "1002-하행-강남방면-8",
    subwayId: "1002",
    updnLine: "하행",
    line: "2호선",
    direction: "강남방면",
    trainLineNm: "강남방면",
    trainStatus: "일반",
    seconds: 480,
    message: "8분 후",
    location: null,
    isLastTrain: false,
  },
];

function busSnapshot(favorite: BusCommuteFavorite, arrivals = busArrivals, updatedAt = NOW, status: LiveSnapshot["latestAttemptStatus"] = "success"): LiveSnapshot {
  return {
    query: {
      kind: "bus",
      key: `bus:${favorite.arsId}`,
      args: { arsId: favorite.arsId },
      stopIds: [favorite.stopId],
    },
    latestAttemptAt: NOW,
    latestAttemptStatus: status,
    lastSuccess: { updatedAt, arrivals },
    error: status === "failure" ? "연결 실패" : null,
  };
}

function subwaySnapshot(
  status: LiveSnapshot["latestAttemptStatus"] = "success",
): LiveSnapshot {
  return {
    query: {
      kind: "subway",
      key: `subway:${subwayFavorite.apiStationName}`,
      args: { station: subwayFavorite.apiStationName },
      stationIds: [station.id],
    },
    latestAttemptAt: NOW,
    latestAttemptStatus: status,
    lastSuccess: { updatedAt: NOW, arrivals: subwayArrivals },
    error: status === "failure" ? "연결 실패" : null,
  };
}

const snapshotsOf = (...snapshots: readonly LiveSnapshot[]): ReadonlyMap<string, LiveSnapshot> =>
  new Map(snapshots.map((snapshot) => [snapshot.query.key, snapshot]));

function favoriteDepartures(
  favorites: readonly TestFavorite[],
  snapshots: ReadonlyMap<string, LiveSnapshot>,
) {
  return (
    <FavoriteDepartures
      favorites={favorites}
      snapshots={snapshots}
      now={NOW}
      onUpdateFavorite={vi.fn()}
      onUnpinFavorite={vi.fn()}
    />
  );
}

function identityCard(text: string): HTMLElement {
  const identity = [...document.querySelectorAll(".favorite-identity")].find(
    (el) => el.textContent?.replace(/\s+/g, " ").trim() === text,
  );
  const card = identity?.closest("article");
  if (!(card instanceof HTMLElement)) {
    throw new Error(`Expected a favorite card with identity ${text}`);
  }
  return card;
}

describe("FavoriteDepartures", () => {
  it("shows only the next two exact bus and subway matches in arrival order", () => {
    render(
      favoriteDepartures(
        [busFavorite, subwayFavorite],
        snapshotsOf(busSnapshot(busFavorite), subwaySnapshot()),
      ),
    );

    const busCard = identityCard("341 · 강동공영차고지");
    const subwayCard = identityCard("2호선 · 강남방면");
    expect(within(busCard as HTMLElement).getByText("2분 후")).toBeVisible();
    expect(within(busCard as HTMLElement).getByText("10분 후")).toBeVisible();
    expect(within(busCard as HTMLElement).getByText("1분 후 출발")).toBeVisible();
    expect(within(busCard as HTMLElement).queryByText("30초후")).toBeNull();
    expect(within(subwayCard as HTMLElement).getByText("4분 후")).toBeVisible();
    expect(within(subwayCard as HTMLElement).getByText("8분 후")).toBeVisible();
    expect(within(subwayCard as HTMLElement).queryByText("곧 도착")).toBeNull();
  });

  it("keeps a fresh card guided at 90 seconds while failure, stale, and unavailable cards suppress guidance", () => {
    const { rerender } = render(
      favoriteDepartures(
        [busFavorite, subwayFavorite],
        snapshotsOf(
          busSnapshot(busFavorite, busArrivals, NOW - 90_000),
          subwaySnapshot("failure"),
        ),
      ),
    );

    const busCard = identityCard("341 · 강동공영차고지");
    const subwayCard = identityCard("2호선 · 강남방면");
    expect(within(busCard).getByText("지금 출발")).toBeVisible();
    expect(within(subwayCard).getByText(/갱신 실패/)).toBeVisible();
    expect(within(subwayCard).queryByText(/후 출발|지금 출발/)).toBeNull();

    rerender(
      favoriteDepartures(
        [busFavorite],
        snapshotsOf(busSnapshot(busFavorite, busArrivals, NOW - 90_001)),
      ),
    );
    expect(screen.getByText("오래된 정보")).toBeVisible();
    expect(screen.queryByText(/후 출발|지금 출발/)).toBeNull();

    rerender(favoriteDepartures([busFavorite], new Map()));
    expect(screen.getByText("정보 없음")).toBeVisible();
    expect(screen.queryByText(/후 출발|지금 출발/)).toBeNull();
  });

it("keeps the separator inside the direction unit so narrow failure cards never detach it", () => {
    render(
      favoriteDepartures(
        [busFavorite],
        snapshotsOf(busSnapshot(busFavorite, busArrivals, NOW, "failure")),
      ),
    );

    const identity = document.querySelector(".favorite-identity");
    expect(identity).not.toBeNull();
    const direction = identity?.querySelector(".favorite-direction") ?? null;
    expect(direction).not.toBeNull();
    // The separator travels WITH the direction: it lives inside the direction
    // unit, never as a detached trailing text node of the route name.
    expect(direction?.textContent).toMatch(/^·\s*강동공영차고지$/);
    expect([...(identity?.childNodes ?? [])].every((node) => node.nodeType !== Node.TEXT_NODE || !(node.textContent ?? "").includes("·"))).toBe(true);
    expect(identity?.textContent?.replace(/\s+/g, " ").trim()).toBe("341 · 강동공영차고지");
  });

  it("edits access minutes and unpins through the supplied mutation callbacks", () => {
    const onUpdateFavorite = vi.fn();
    const onUnpinFavorite = vi.fn();
    render(
      <FavoriteDepartures
        favorites={[busFavorite]}
        snapshots={snapshotsOf(busSnapshot(busFavorite))}
        now={NOW}
        onUpdateFavorite={onUpdateFavorite}
        onUnpinFavorite={onUnpinFavorite}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "341 · 강동공영차고지 접근 시간 수정" }));
    fireEvent.change(screen.getByLabelText("341 · 강동공영차고지 접근 시간"), { target: { value: "8" } });
    fireEvent.click(screen.getByRole("button", { name: "접근 시간 수정 취소" }));
    fireEvent.click(screen.getByRole("button", { name: "341 · 강동공영차고지 접근 시간 수정" }));
    expect(screen.getByLabelText("341 · 강동공영차고지 접근 시간")).toHaveValue(1);
    fireEvent.change(screen.getByLabelText("341 · 강동공영차고지 접근 시간"), { target: { value: "8" } });
    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    fireEvent.click(
      screen.getByRole("button", { name: "341 · 강동공영차고지 즐겨찾기 해제" }),
    );

    expect(onUpdateFavorite).toHaveBeenCalledWith("fav-bus", {
      kind: "bus",
      stopId: stop.id,
      arsId: stop.arsId,
      routeId: busFavorite.routeId,
      routeName: "341",
      direction: "강동공영차고지",
      accessMinutes: 8,
    });
    expect(onUnpinFavorite).toHaveBeenCalledWith("fav-bus");
  });
});
