// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { fetchArrivals, fetchSubwayArrivals } from "./api/client";
import type { BusArrival, BusStop } from "./domain/bus";
import type { SubwayArrival, SubwayStation } from "./domain/subway";

const busStop: BusStop = {
  id: "124000454" as BusStop["id"],
  arsId: "25014" as BusStop["arsId"],
  name: "천호역",
  lat: 37.5379482005,
  lng: 127.1255385876,
  distanceMeters: 151,
};

const busStop2: BusStop = {
  id: "124000455" as BusStop["id"],
  arsId: "25015" as BusStop["arsId"],
  name: "강동농협",
  lat: 37.5380123,
  lng: 127.1260021,
  distanceMeters: 210,
};

const subwayStation: SubwayStation = {
  id: "osm-node-5801572034" as SubwayStation["id"],
  name: "천호",
  line: "8호선",
  lat: 37.5385225,
  lng: 127.1234021,
  distanceMeters: 228,
};

const subwayStation2: SubwayStation = {
  id: "osm-node-11223344" as SubwayStation["id"],
  name: "강남",
  line: "2호선",
  lat: 37.4979,
  lng: 127.0276,
  distanceMeters: 180,
};

const busArrivals: readonly BusArrival[] = [
  {
    routeId: "124900001" as BusArrival["routeId"],
    routeName: "강동05",
    direction: "강동공영차고지",
    routeType: "2",
    lowFloor: true,
    first: {
      message: "3분 후",
      seconds: 180,
      remainingStops: 1,
      congestion: "여유",
    },
    second: null,
  },
];

const subwayArrivals: readonly SubwayArrival[] = [
  {
    id: "1008-상행-암사행",
    subwayId: "1008",
    updnLine: "상행",
    line: "8호선",
    direction: "암사행",
    trainLineNm: "암사행",
    trainStatus: "일반",
    seconds: 90,
    message: "전역 출발",
    location: "강동구청",
    isLastTrain: false,
  },
  {
    id: "1008-하행-모란행",
    subwayId: "1008",
    updnLine: "하행",
    line: "8호선",
    direction: "모란행",
    trainLineNm: "모란행",
    trainStatus: "일반",
    seconds: 180,
    message: "2번째 전역",
    location: "잠실",
    isLastTrain: false,
  },
];

vi.mock("./components/MapPicker", () => ({
  MapPicker: ({ onSave }: { onSave: (stops: readonly BusStop[]) => void }) => (
    <div>
      <button type="button" onClick={() => onSave([busStop])}>
        테스트 정류장 선택
      </button>
      <button type="button" onClick={() => onSave([busStop2])}>
        테스트 정류장 2 선택
      </button>
    </div>
  ),
}));

vi.mock("./components/SubwayPicker", () => ({
  SubwayPicker: ({
    onSave,
  }: {
    onSave: (stations: readonly SubwayStation[]) => void;
  }) => (
    <div>
      <button type="button" onClick={() => onSave([subwayStation])}>
        테스트 역 선택
      </button>
      <button type="button" onClick={() => onSave([subwayStation2])}>
        테스트 역 2 선택
      </button>
    </div>
  ),
}));

vi.mock("./components/MapStage", () => ({
  MapStage: ({
    stops,
    subwayStations,
  }: {
    stops: readonly BusStop[];
    subwayStations: readonly SubwayStation[];
  }) => (
    <section
      aria-label="선택한 정류장과 역 지도"
      data-stop-count={stops.length}
      data-station-count={subwayStations.length}
    />
  ),
}));

vi.mock("./api/client", async (importOriginal) => {
  const original = await importOriginal<typeof import("./api/client")>();
  return {
    ...original,
    fetchArrivals: vi.fn<typeof original.fetchArrivals>(),
    fetchSubwayArrivals: vi.fn<typeof original.fetchSubwayArrivals>(),
  };
});

vi.mock("./hooks/useAuthSession", () => ({
  useAuthSession: () => ({
    authenticated: false,
    checked: true,
    user: null,
    error: null,
  }),
}));

describe("App minimal arrivals flow", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(fetchArrivals).mockReset();
    vi.mocked(fetchSubwayArrivals).mockReset();
    vi.mocked(fetchArrivals).mockResolvedValue({
      arrivals: [...busArrivals],
      updatedAt: "2026-08-23T03:10:20.000Z",
    });
    vi.mocked(fetchSubwayArrivals).mockResolvedValue({
      arrivals: [...subwayArrivals],
      updatedAt: "2026-08-23T03:10:20.000Z",
    });
  });

  it("shows only bus and subway selection on first visit", () => {
    render(<App />);

    expect(
      screen.getByRole("tablist", { name: "출퇴근 선택" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "출근" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("tab", { name: "퇴근" })).toBeInTheDocument();
    expect(
      screen.getByRole("tablist", { name: "교통수단 선택" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "버스" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("tab", { name: "지하철" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "정류장 찾기" })).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Google로 로그인" }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/절차/)).not.toBeInTheDocument();
    expect(screen.queryByText(/즐겨찾기/)).not.toBeInTheDocument();
  });

  it("keeps bus stop settings independent between commute contexts", async () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "정류장 찾기" }));
    fireEvent.click(screen.getByRole("button", { name: "테스트 정류장 선택" }));
    expect(await screen.findByText("천호역 다음 버스")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "퇴근" }));
    expect(screen.queryByText("천호역 다음 버스")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "정류장 찾기" }));
    fireEvent.click(
      screen.getByRole("button", { name: "테스트 정류장 2 선택" }),
    );
    expect(await screen.findByText("강동농협 다음 버스")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "출근" }));
    expect(await screen.findByText("천호역 다음 버스")).toBeInTheDocument();
    expect(screen.queryByText("강동농협 다음 버스")).not.toBeInTheDocument();
  });

  it("selects a bus stop and shows its next arrivals", async () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "정류장 찾기" }));
    fireEvent.click(screen.getByRole("button", { name: "테스트 정류장 선택" }));

    expect(await screen.findByText("천호역 다음 버스")).toBeInTheDocument();
    expect(screen.getByText("강동05")).toBeInTheDocument();
    expect(screen.getByText("3분")).toBeInTheDocument();
    await waitFor(() => expect(fetchArrivals).toHaveBeenCalledWith("25014"));
  });

  it("restores the selected bus stop on the next visit", async () => {
    const firstVisit = render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "정류장 찾기" }));
    fireEvent.click(screen.getByRole("button", { name: "테스트 정류장 선택" }));
    await screen.findByText("강동05");
    firstVisit.unmount();
    vi.mocked(fetchArrivals).mockClear();

    render(<App />);

    expect(
      screen.getByRole("button", {
        name: "천호역 ARS 25014 지금 보는 곳",
      }),
    ).toHaveAttribute("aria-pressed", "true");
    await waitFor(() => expect(fetchArrivals).toHaveBeenCalledWith("25014"));
  });

  it("migrates a legacy single-selection document on load", async () => {
    localStorage.setItem(
      "mota:transit-selections:v1",
      JSON.stringify({
        busStops: [busStop],
        subwayStations: [],
        selectedBusStopId: busStop.id,
        selectedSubwayStationId: null,
      }),
    );

    render(<App />);

    expect(
      screen.getByRole("button", {
        name: "천호역 ARS 25014 지금 보는 곳",
      }),
    ).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("tab", { name: "퇴근" }));
    expect(
      screen.getByRole("button", {
        name: "천호역 ARS 25014 지금 보는 곳",
      }),
    ).toHaveAttribute("aria-pressed", "true");
    await screen.findByText("천호역 다음 버스");
    await waitFor(() => expect(fetchArrivals).toHaveBeenCalledWith("25014"));
  });

  it("watches two stops at once and drops one on toggle", async () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "정류장 찾기" }));
    fireEvent.click(screen.getByRole("button", { name: "테스트 정류장 선택" }));
    await screen.findByText("천호역 다음 버스");

    fireEvent.click(screen.getByRole("button", { name: "정류장 찾기" }));
    fireEvent.click(screen.getByRole("button", { name: "테스트 정류장 2 선택" }));

    expect(await screen.findByText("강동농협 다음 버스")).toBeInTheDocument();
    expect(screen.getByText("천호역 다음 버스")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "천호역 버스 도착정보 새로고침" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "강동농협 버스 도착정보 새로고침" }),
    ).toBeInTheDocument();
    await waitFor(() => expect(fetchArrivals).toHaveBeenCalledWith("25014"));
    await waitFor(() => expect(fetchArrivals).toHaveBeenCalledWith("25015"));

    fireEvent.click(
      screen.getByRole("button", {
        name: "천호역 ARS 25014 지금 보는 곳",
      }),
    );

    await waitFor(() =>
      expect(
        screen.queryByText("천호역 다음 버스"),
      ).not.toBeInTheDocument(),
    );
    expect(screen.getByText("강동농협 다음 버스")).toBeInTheDocument();
  });

  it("selects a subway station and exposes arrival directions", async () => {
    render(<App />);

    fireEvent.click(screen.getByRole("tab", { name: "지하철" }));
    fireEvent.click(screen.getByRole("button", { name: "역 찾기" }));
    fireEvent.click(screen.getByRole("button", { name: "테스트 역 선택" }));

    expect(await screen.findByText("천호 다음 열차")).toBeInTheDocument();
    expect(
      screen.getByRole("tablist", { name: "지하철 방향 선택" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "8호선 상행" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "8호선 하행" })).toBeInTheDocument();
    await waitFor(() => expect(fetchSubwayArrivals).toHaveBeenCalledWith("천호"));
  });

  it("keeps subway stations independent between commute contexts", async () => {
    render(<App />);

    fireEvent.click(screen.getByRole("tab", { name: "지하철" }));
    fireEvent.click(screen.getByRole("button", { name: "역 찾기" }));
    fireEvent.click(screen.getByRole("button", { name: "테스트 역 선택" }));
    expect(await screen.findByText("천호 다음 열차")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "퇴근" }));
    expect(screen.queryByText("천호 다음 열차")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "역 찾기" }));
    fireEvent.click(screen.getByRole("button", { name: "테스트 역 2 선택" }));
    expect(await screen.findByText("강남 다음 열차")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "출근" }));
    expect(await screen.findByText("천호 다음 열차")).toBeInTheDocument();
    expect(screen.queryByText("강남 다음 열차")).not.toBeInTheDocument();
  });
});
