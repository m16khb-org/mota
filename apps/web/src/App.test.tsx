// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { fetchArrivals } from "./api/client";
import type { BusArrival, BusStop } from "./domain/bus";

const { mediaQueryState } = vi.hoisted(() => ({
  mediaQueryState: { matches: false },
}));

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

vi.mock("./components/MapStage", () => ({
  MapStage: ({
    stops,
    searchMode,
    isDesktop,
    onCloseMobileMap,
    onSaveBusStops,
  }: {
    stops: readonly BusStop[];
    searchMode: "bus" | null;
    isDesktop: boolean;
    onCloseMobileMap: () => void;
    onSaveBusStops: (stops: readonly BusStop[]) => void;
  }) => (
    <section
      aria-label="선택한 정류장 지도"
      data-stop-count={stops.length}
      data-search-mode={searchMode ?? ""}
    >
      {!isDesktop && searchMode === null ? (
        <button type="button" onClick={onCloseMobileMap}>
          지도 닫기
        </button>
      ) : null}
      {searchMode === "bus" ? (
        <>
          <button type="button" onClick={() => onSaveBusStops([busStop])}>
            테스트 정류장 선택
          </button>
          <button type="button" onClick={() => onSaveBusStops([busStop2])}>
            테스트 정류장 2 선택
          </button>
        </>
      ) : null}
    </section>
  ),
}));

vi.mock("./hooks/useMediaQuery", () => ({
  useMediaQuery: () => mediaQueryState.matches,
}));

vi.mock("./api/client", async (importOriginal) => {
  const original = await importOriginal<typeof import("./api/client")>();
  return {
    ...original,
    fetchArrivals: vi.fn<typeof original.fetchArrivals>(),
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
    mediaQueryState.matches = false;
    vi.mocked(fetchArrivals).mockReset();
    vi.mocked(fetchArrivals).mockResolvedValue({
      arrivals: [...busArrivals],
      updatedAt: "2026-08-23T03:10:20.000Z",
    });
  });

  it("shows only bus selection on first visit", () => {
    render(<App />);

    expect(screen.getByRole("tablist", { name: "출퇴근 선택" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "출근" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "퇴근" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "정류장 찾기" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Google로 로그인" })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "지하철" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "3D 지도 미리보기" })).not.toBeInTheDocument();
    expect(screen.queryByText(/절차/)).not.toBeInTheDocument();
    expect(screen.queryByText(/즐겨찾기/)).not.toBeInTheDocument();
  });

  it("keeps the map closed on mobile until the user opens it", () => {
    render(<App />);

    expect(
      screen.queryByRole("region", {
        name: "선택한 정류장 지도",
      }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "지도 열기" }));
    expect(
      screen.getByRole("region", {
        name: "선택한 정류장 지도",
      }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "지도 닫기" }));
    expect(
      screen.queryByRole("region", {
        name: "선택한 정류장 지도",
      }),
    ).not.toBeInTheDocument();
  });

  it("keeps the map visible on desktop", () => {
    mediaQueryState.matches = true;

    render(<App />);

    expect(
      screen.getByRole("region", {
        name: "선택한 정류장 지도",
      }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "지도 열기" })).not.toBeInTheDocument();
  });

  it("opens bus finding on the current map instead of a dialog", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "정류장 찾기" }));
    expect(screen.getByRole("region", { name: "선택한 정류장 지도" })).toHaveAttribute(
      "data-search-mode",
      "bus",
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("keeps bus stop settings independent between commute contexts", async () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "정류장 찾기" }));
    fireEvent.click(screen.getByRole("button", { name: "테스트 정류장 선택" }));
    expect(await screen.findByText("천호역 다음 버스")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "퇴근" }));
    expect(screen.queryByText("천호역 다음 버스")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "정류장 찾기" }));
    fireEvent.click(screen.getByRole("button", { name: "테스트 정류장 2 선택" }));
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
        subwayStations: "malformed obsolete stations",
        selectedBusStopId: busStop.id,
        selectedSubwayStationId: { obsolete: true },
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

    await waitFor(() => expect(screen.queryByText("천호역 다음 버스")).not.toBeInTheDocument());
    expect(screen.getByText("강동농협 다음 버스")).toBeInTheDocument();
  });
});
