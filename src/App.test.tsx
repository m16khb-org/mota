// @vitest-environment jsdom

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { ApiError, fetchArrivals, fetchNearbyStops, fetchSubwayArrivals } from "./api/client";
import type { BusStop } from "./domain/bus";
import type { SubwayStation } from "./domain/subway";

const companyStop: BusStop = {
  id: "124000454" as BusStop["id"],
  arsId: "25014" as BusStop["arsId"],
  name: "천호역",
  lat: 37.5379482005,
  lng: 127.1255385876,
  distanceMeters: 151,
};

const homeStop: BusStop = {
  id: "124000120" as BusStop["id"],
  arsId: "25273" as BusStop["arsId"],
  name: "암사역",
  lat: 37.5509,
  lng: 127.1274,
  distanceMeters: 96,
};

const secondCompanyStop: BusStop = {
  id: "124000455" as BusStop["id"],
  arsId: "25015" as BusStop["arsId"],
  name: "천호역현대백화점",
  lat: 37.5384,
  lng: 127.1249,
  distanceMeters: 203,
};

const subwayStation: SubwayStation = {
  id: "osm-node-5801572034" as SubwayStation["id"],
  name: "천호",
  line: "수도권 전철",
  lat: 37.5385225,
  lng: 127.1234021,
  distanceMeters: 228,
};

const scrollIntoView = vi.fn();
const resizeCallbacks: ResizeObserverCallback[] = [];
class TestResizeObserver {
  constructor(callback: ResizeObserverCallback) {
    resizeCallbacks.push(callback);
  }
  observe() {}
  unobserve() {}
  disconnect() {}
}
Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
  configurable: true,
  value: scrollIntoView,
});
const railScrollTo = vi.fn();
Object.defineProperty(HTMLElement.prototype, "scrollTo", {
  configurable: true,
  value: railScrollTo,
});
vi.stubGlobal("ResizeObserver", TestResizeObserver);

let matchMediaMatches = false;
Object.defineProperty(window, "matchMedia", {
  configurable: true,
  writable: true,
  value: (query: string) => ({
    matches: matchMediaMatches && query.includes("960"),
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }),
});

vi.mock("./components/MapPicker", () => ({
  MapPicker: ({ onSave }: { onSave: (stops: readonly BusStop[]) => void }) => (
    <>
      <button type="button" onClick={() => onSave([companyStop])}>
        테스트 회사 정류장 저장
      </button>
      <button type="button" onClick={() => onSave([homeStop])}>
        테스트 집 정류장 저장
      </button>
      <button type="button" onClick={() => onSave([secondCompanyStop])}>
        테스트 두 번째 회사 정류장 저장
      </button>
    </>
  ),
}));

vi.mock("./components/SubwayPicker", () => ({
  SubwayPicker: ({
    onSave,
  }: {
    onSave: (stations: readonly SubwayStation[]) => void;
  }) => (
    <button type="button" onClick={() => onSave([subwayStation])}>
      테스트 지하철역 저장
    </button>
  ),
}));

vi.mock("./components/MapCanvas", () => ({
  MapCanvas: ({
    stops,
    pendingStops = [],
    onAddPending,
    subwayStations = [],
    selectedSubwayStationIds = [],
    onSelectSubway,
  }: {
    stops: readonly BusStop[];
    pendingStops?: readonly BusStop[];
    onAddPending?: (stop: BusStop) => void;
    subwayStations?: readonly SubwayStation[];
    selectedSubwayStationIds?: SubwayStation["id"][];
    onSelectSubway?: (station: SubwayStation) => void;
  }) => {
    const savedIds = new Set(stops.map((stop) => stop.id));
    const discoverable = pendingStops.filter((stop) => !savedIds.has(stop.id));
    return (
      <section
        aria-label="통근 정류장 지도"
        data-stop-count={stops.length}
        data-pending-count={discoverable.length}
        data-subway-count={subwayStations.length}
      >
        {discoverable.map((stop) => (
          <button
            key={stop.id}
            type="button"
            aria-label={`마커 ${stop.name} 추가`}
            onClick={() => onAddPending?.(stop)}
          />
        ))}
        {subwayStations.map((station) => (
          <button
            key={station.id}
            type="button"
            aria-label={`${station.name} 지하철역 마커`}
            aria-pressed={
              selectedSubwayStationIds.includes(station.id) || undefined
            }
            onClick={() => onSelectSubway?.(station)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelectSubway?.(station);
              }
            }}
          />
        ))}
      </section>
    );
  },
}));

vi.mock("./api/client", async (importOriginal) => {
  const original = await importOriginal<typeof import("./api/client")>();
  return {
    ...original,
    fetchArrivals: vi.fn(),
    fetchNearbyStops: vi.fn(),
    fetchSubwayArrivals: vi.fn(),
  };
});

describe("App company commute", () => {
  beforeEach(() => {
    localStorage.clear();
    matchMediaMatches = false;
    scrollIntoView.mockClear();
    railScrollTo.mockClear();
    vi.mocked(fetchArrivals).mockReset();
    vi.mocked(fetchSubwayArrivals).mockReset();
    vi.mocked(fetchSubwayArrivals).mockResolvedValue({
      arrivals: [
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
      ],
      updatedAt: "2026-08-20T03:10:20.000Z",
    });
    vi.mocked(fetchArrivals).mockResolvedValue({
      arrivals: [
        {
          routeId: "124900001" as never,
          routeName: "강동05",
          direction: "강동공영차고지",
          routeType: "2",
          lowFloor: true,
          first: {
            message: "3분1초후[1번째 전]",
            seconds: 181,
            remainingStops: 1,
            congestion: "여유",
          },
          second: null,
        },
      ],
      updatedAt: "2026-08-17T11:14:25.000Z",
    });
  });

  it("keeps a live map visible as the primary desktop surface", () => {
    render(<App />);

    expect(screen.getByRole("region", { name: "통근 정류장 지도" })).toHaveAttribute(
      "data-stop-count",
      "0",
    );
  });

  it("saves a company-bound stop and renders live arrivals", async () => {
    render(<App />);

    expect(screen.getByRole("tab", { name: "회사로" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    fireEvent.click(screen.getByRole("button", { name: "버스 정류장 추가" }));
    fireEvent.click(screen.getByRole("button", { name: "테스트 회사 정류장 저장" }));

    expect(await screen.findByText("천호역")).toBeInTheDocument();
    expect(screen.getByTestId("save-announcement")).toHaveTextContent("천호역");
    expect(await screen.findByText("강동05")).toBeInTheDocument();
    expect(screen.getByText("3분")).toBeInTheDocument();
    await waitFor(() => expect(fetchArrivals).toHaveBeenCalledWith(companyStop.arsId));
  });

  it("keeps the home-bound stop separate from the company-bound stop", async () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "버스 정류장 추가" }));
    fireEvent.click(screen.getByRole("button", { name: "테스트 회사 정류장 저장" }));
    expect(await screen.findByText("천호역")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "집으로" }));
    expect(
      screen.getByRole("button", { name: "버스 정류장 추가" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "버스 정류장 추가" }));
    fireEvent.click(screen.getByRole("button", { name: "테스트 집 정류장 저장" }));
    expect(await screen.findByText("암사역")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "회사로" }));
    expect(screen.getByText("천호역")).toBeInTheDocument();
    expect(screen.queryByText("암사역")).not.toBeInTheDocument();
  });

  it("restores selected commute stops on the next visit", async () => {
    const firstVisit = render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "버스 정류장 추가" }));
    fireEvent.click(screen.getByRole("button", { name: "테스트 회사 정류장 저장" }));
    expect(await screen.findByText("천호역")).toBeInTheDocument();
    firstVisit.unmount();

    render(<App />);
    expect(screen.getByText("천호역")).toBeInTheDocument();
    await waitFor(() => expect(fetchArrivals).toHaveBeenCalledWith(companyStop.arsId));
  });

  it("adds multiple named company and home places", () => {
    render(<App />);

    fireEvent.change(screen.getByRole("textbox", { name: "새 회사 이름" }), {
      target: { value: "강남 사무실" },
    });
    fireEvent.click(screen.getByRole("button", { name: "회사 추가" }));
    expect(
      screen.getByRole("button", { name: "강남 사무실, 절차 0개" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("save-announcement")).toHaveTextContent(
      "강남 사무실 장소를 추가했습니다.",
    );

    fireEvent.click(screen.getByRole("tab", { name: "집으로" }));
    fireEvent.change(screen.getByRole("textbox", { name: "새 집 이름" }), {
      target: { value: "부모님 집" },
    });
    fireEvent.click(screen.getByRole("button", { name: "집 추가" }));
    expect(
      screen.getByRole("button", { name: "부모님 집, 절차 0개" }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("keeps the third and later company and home places visible", () => {
    render(<App />);

    for (const name of ["회사 2", "회사 3", "회사 4"]) {
      fireEvent.change(screen.getByRole("textbox", { name: "새 회사 이름" }), {
        target: { value: name },
      });
      fireEvent.click(screen.getByRole("button", { name: "회사 추가" }));
    }
    expect(
      screen.getByRole("button", { name: "회사 4, 절차 0개" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(scrollIntoView).not.toHaveBeenCalled();
    railScrollTo.mockClear();
    resizeCallbacks.at(-1)?.([], new TestResizeObserver(() => {}));
    expect(railScrollTo).toHaveBeenCalled();
    railScrollTo.mockClear();
    window.dispatchEvent(new Event("resize"));
    expect(railScrollTo).toHaveBeenCalled();
    expect(scrollIntoView).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("tab", { name: "집으로" }));
    for (const name of ["집 2", "집 3", "집 4"]) {
      fireEvent.change(screen.getByRole("textbox", { name: "새 집 이름" }), {
        target: { value: name },
      });
      fireEvent.click(screen.getByRole("button", { name: "집 추가" }));
    }
    expect(
      screen.getByRole("button", { name: "집 4, 절차 0개" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it("adds and switches between multiple stops in one place", async () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "버스 정류장 추가" }));
    fireEvent.click(screen.getByRole("button", { name: "테스트 회사 정류장 저장" }));
    expect(await screen.findByText("천호역")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "버스 정류장 추가" }));
    fireEvent.click(
      screen.getByRole("button", {
        name: "테스트 두 번째 회사 정류장 저장",
      }),
    );

    expect(await screen.findByText("천호역현대백화점")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "통근 정류장 지도" })).toHaveAttribute(
      "data-stop-count",
      "2",
    );
    fireEvent.click(screen.getByRole("button", { name: /천호역 · ARS 25014/ }));
    await waitFor(() => expect(fetchArrivals).toHaveBeenCalledWith(companyStop.arsId));
  });

  it("adds a subway station to the active commute route", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "지하철역 추가" }));
    fireEvent.click(screen.getByRole("button", { name: "테스트 지하철역 저장" }));

    expect(screen.getByText("천호")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "통근 정류장 지도" })).toHaveAttribute(
      "data-subway-count",
      "1",
    );
    expect(screen.getByTestId("save-announcement")).toHaveTextContent(
      "천호 1개 지하철역",
    );
  });

  it("keeps mobile stop discovery on the modal picker without stage controls", () => {
    render(<App />);

    expect(screen.queryByTestId("stage-map-controls")).toBeNull();
    expect(
      screen.queryByRole("button", { name: /이 위치에서 찾기/ }),
    ).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "버스 정류장 추가" }));
    expect(
      screen.getByRole("button", { name: "테스트 회사 정류장 저장" }),
    ).toBeVisible();
  });

  it("shows live subway arrivals when a saved station is selected", async () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "지하철역 추가" }));
    fireEvent.click(screen.getByRole("button", { name: "테스트 지하철역 저장" }));

    fireEvent.click(
      screen.getByRole("button", { name: "천호 지하철역 수도권 전철" }),
    );

    expect(await screen.findByText("천호 도착 예정")).toBeInTheDocument();
    expect(fetchSubwayArrivals).toHaveBeenCalledWith("천호");
    expect(await screen.findByText("2호선")).toBeInTheDocument();
    expect(screen.getByText("강남방면")).toBeInTheDocument();
    expect(screen.getByText("곧 도착")).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "천호 지하철역 수도권 전철" }),
    );
    expect(screen.queryByText("천호 도착 예정")).toBeNull();
  });
});

describe("App desktop stage stop search", () => {
  beforeEach(() => {
    localStorage.clear();
    scrollIntoView.mockClear();
    railScrollTo.mockClear();
    matchMediaMatches = true;
    vi.mocked(fetchNearbyStops).mockReset();
    vi.mocked(fetchArrivals).mockResolvedValue({
      arrivals: [],
      updatedAt: "2026-08-20T00:00:00.000Z",
    });
  });

  afterEach(() => {
    matchMediaMatches = false;
  });

  it("adds nearby stops directly from the main map and keeps the rest discoverable", async () => {
    vi.mocked(fetchNearbyStops).mockResolvedValue([
      companyStop,
      secondCompanyStop,
    ]);
    render(<App />);

    fireEvent.click(
      screen.getByRole("button", { name: /이 위치에서 찾기/ }),
    );

    expect(await screen.findByRole("status")).toHaveTextContent(
      "주변 정류장 2곳",
    );
    const mapRegion = screen.getByRole("region", { name: "통근 정류장 지도" });
    expect(mapRegion).toHaveAttribute("data-pending-count", "2");

    fireEvent.click(screen.getByRole("button", { name: "마커 천호역 추가" }));

    expect(mapRegion).toHaveAttribute("data-stop-count", "1");
    expect(mapRegion).toHaveAttribute("data-pending-count", "1");
    expect(screen.getByTestId("save-announcement")).toHaveTextContent(
      "천호역 정류장을",
    );

    fireEvent.click(
      screen.getByRole("button", { name: "마커 천호역현대백화점 추가" }),
    );

    expect(mapRegion).toHaveAttribute("data-stop-count", "2");
    expect(mapRegion).toHaveAttribute("data-pending-count", "0");
  });

  it("explains the Seoul service boundary instead of asking to retry", async () => {
    vi.mocked(fetchNearbyStops).mockRejectedValue(
      new ApiError(400, "INVALID_LOCATION"),
    );
    render(<App />);

    fireEvent.click(
      screen.getByRole("button", { name: /이 위치에서 찾기/ }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "서울 서비스 범위 밖이에요",
    );
  });
});

const BUS_DIRECTION = "강동공영차고지";
const BUS_ROUTE_ID = "124900001" as never;
const FLOW_NOW = Date.parse("2026-08-21T02:00:00.000Z");
const flowUpdatedAt = () => new Date(Date.now() - 60_000).toISOString();

const busFlowPayload = (firstSeconds: number) => ({
  arrivals: [
    {
      routeId: BUS_ROUTE_ID,
      routeName: "강동05",
      direction: BUS_DIRECTION,
      routeType: "2",
      lowFloor: true,
      first: {
        message: `${firstSeconds}초 후`,
        seconds: firstSeconds,
        remainingStops: 3,
        congestion: "여유" as const,
      },
      second: {
        message: "15분 후",
        seconds: 900,
        remainingStops: 9,
        congestion: null,
      },
    },
    {
      routeId: "124900099" as never,
      routeName: "강동05",
      direction: "암사역 방면",
      routeType: "2",
      lowFloor: true,
      first: {
        message: "30초 후",
        seconds: 30,
        remainingStops: 1,
        congestion: null,
      },
      second: null,
    },
  ],
  updatedAt: flowUpdatedAt(),
});

const subwayFlowPayload = (firstSeconds: number, secondSeconds: number) => ({
  arrivals: [
    {
      id: "1002-상행-성수방면",
      subwayId: "1002",
      updnLine: "상행",
      line: "2호선",
      direction: "성수방면",
      trainLineNm: "성수방면",
      trainStatus: "일반",
      seconds: 20,
      message: "전역 출발",
      location: "을지로",
      isLastTrain: false,
    },
    {
      id: "1002-하행-강남방면-1",
      subwayId: "1002",
      updnLine: "하행",
      line: "2호선",
      direction: "강남방면",
      trainLineNm: "강남방면",
      trainStatus: "일반",
      seconds: firstSeconds,
      message: "전역 출발",
      location: "을지로",
      isLastTrain: false,
    },
    {
      id: "1002-하행-강남방면-2",
      subwayId: "1002",
      updnLine: "하행",
      line: "2호선",
      direction: "강남방면",
      trainLineNm: "강남방면",
      trainStatus: "일반",
      seconds: secondSeconds,
      message: "전역 출발",
      location: "을지로",
      isLastTrain: false,
    },
  ],
  updatedAt: flowUpdatedAt(),
});

/** Saved v4 state: walk 3분 → 강동05 (ride 15, fallback 10) → 2호선 하행
 * (ride 20, fallback 5), plus one bus and one subway favorite. */
function seedDailyCommute(): void {
  localStorage.setItem(
    "commute-bus-web:stops:v4",
    JSON.stringify({
      company: {
        places: [
          {
            id: "company-flow",
            name: "회사",
            stops: [companyStop],
            subwayStations: [subwayStation],
            selectedStopId: companyStop.id,
            routeOptions: [],
            activeRouteOptionId: null,
            procedures: [
              {
                id: "proc-flow",
                kind: "ready",
                name: "출근 루틴",
                steps: [
                  { id: "s1", kind: "walk", minutes: 3 },
                  {
                    id: "s2",
                    kind: "bus",
                    stopId: companyStop.id,
                    arsId: companyStop.arsId,
                    routeId: BUS_ROUTE_ID,
                    routeName: "강동05",
                    direction: BUS_DIRECTION,
                    rideMinutes: 15,
                    fallbackWaitMinutes: 10,
                  },
                  {
                    id: "s3",
                    kind: "subway",
                    stationId: subwayStation.id,
                    apiStationName: subwayStation.name,
                    subwayId: "1002",
                    updnLine: "하행",
                    lineName: "2호선",
                    trainLineNm: "강남방면",
                    rideMinutes: 20,
                    fallbackWaitMinutes: 5,
                  },
                ],
              },
            ],
            favorites: [
              {
                id: "fav-bus",
                kind: "bus",
                stopId: companyStop.id,
                arsId: companyStop.arsId,
                routeId: BUS_ROUTE_ID,
                routeName: "강동05",
                direction: BUS_DIRECTION,
                accessMinutes: 5,
              },
              {
                id: "fav-subway",
                kind: "subway",
                stationId: subwayStation.id,
                apiStationName: subwayStation.name,
                subwayId: "1002",
                updnLine: "하행",
                lineName: "2호선",
                trainLineNm: "강남방면",
                accessMinutes: 4,
              },
            ],
            activeProcedureId: "proc-flow",
          },
        ],
        activePlaceId: "company-flow",
      },
      home: {
        places: [
          {
            id: "home-flow",
            name: "집",
            stops: [],
            subwayStations: [],
            selectedStopId: null,
            routeOptions: [],
            activeRouteOptionId: null,
            procedures: [],
            favorites: [],
            activeProcedureId: null,
          },
        ],
        activePlaceId: "home-flow",
      },
    }),
  );
}

function setDocumentVisibility(state: DocumentVisibilityState): void {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => state,
  });
  document.dispatchEvent(new Event("visibilitychange"));
}

async function pinBothFavorites(): Promise<void> {
  fireEvent.click(
    screen.getByRole("button", {
      name: `강동05 ${BUS_DIRECTION} 즐겨찾기 추가`,
    }),
  );
  await act(async () => {});
  fireEvent.click(
    screen.getByRole("button", { name: "천호 지하철역 수도권 전철" }),
  );
  await act(async () => {});
  const subwayPinButtons = screen.getAllByRole("button", {
    name: "2호선 · 강남방면 즐겨찾기 추가",
  });
  if (subwayPinButtons[0] === undefined) {
    throw new Error("Expected a subway favorite pin button");
  }
  fireEvent.click(subwayPinButtons[0]);
  await act(async () => {});
  fireEvent.click(
    screen.getByRole("button", { name: "천호 지하철역 수도권 전철" }),
  );
  await act(async () => {});
}

async function selectFavoriteOption(
  selectLabel: string,
  optionName: string,
): Promise<void> {
  const option = screen.getByRole("option", { name: optionName });
  fireEvent.change(screen.getByLabelText(selectLabel), {
    target: { value: (option as HTMLOptionElement).value },
  });
  await act(async () => {});
}

async function authorProcedureThroughEditor(): Promise<void> {
  fireEvent.click(screen.getByRole("button", { name: "절차 추가" }));
  await act(async () => {});

  fireEvent.click(screen.getByRole("button", { name: "도보 추가" }));
  fireEvent.change(screen.getByLabelText("1번째 도보 시간 (분)"), {
    target: { value: "3" },
  });

  fireEvent.click(screen.getByRole("button", { name: "버스 추가" }));
  await selectFavoriteOption("2번째 버스 서비스", `강동05 · ${BUS_DIRECTION}`);
  fireEvent.change(screen.getByLabelText("2번째 버스 탑승 시간 (분)"), {
    target: { value: "15" },
  });
  fireEvent.change(screen.getByLabelText("2번째 버스 대기 대안 시간 (분)"), {
    target: { value: "10" },
  });

  fireEvent.click(screen.getByRole("button", { name: "지하철 추가" }));
  await selectFavoriteOption("3번째 지하철 서비스", "2호선 · 강남방면");
  fireEvent.change(screen.getByLabelText("3번째 지하철 탑승 시간 (분)"), {
    target: { value: "20" },
  });
  fireEvent.change(screen.getByLabelText("3번째 지하철 대기 대안 시간 (분)"), {
    target: { value: "5" },
  });

  fireEvent.change(screen.getByLabelText("절차 이름"), {
    target: { value: "출근 루틴" },
  });
  fireEvent.click(screen.getByRole("button", { name: "절차 저장" }));
  await act(async () => {});
}

/** Locates the favorite board identity by its full text; the route and
 * direction render as separate spans (separator bound to the direction), so
 * flat getByText cannot match the split elements. */
function favoriteIdentity(text: string): HTMLElement | null {
  const match = [...document.querySelectorAll(".favorite-identity")].find(
    (el) => el.textContent?.replace(/\s+/g, " ").trim() === text,
  );
  return match instanceof HTMLElement ? match : null;
}

describe("App daily commute flow", () => {
  beforeEach(() => {
    localStorage.clear();
    matchMediaMatches = false;
    scrollIntoView.mockClear();
    railScrollTo.mockClear();
    vi.useFakeTimers({ now: FLOW_NOW });
    vi.mocked(fetchArrivals).mockReset();
    vi.mocked(fetchSubwayArrivals).mockReset();
    vi.mocked(fetchNearbyStops).mockReset();
    vi.mocked(fetchArrivals).mockImplementation(async () => busFlowPayload(300));
    vi.mocked(fetchSubwayArrivals).mockImplementation(async () =>
      subwayFlowPayload(120, 1800),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("pins exact services from observed rows, authors an ordered procedure, and restores it after reload", async () => {
    const firstVisit = render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "버스 정류장 추가" }));
    fireEvent.click(screen.getByRole("button", { name: "테스트 회사 정류장 저장" }));
    fireEvent.click(screen.getByRole("button", { name: "지하철역 추가" }));
    fireEvent.click(screen.getByRole("button", { name: "테스트 지하철역 저장" }));
    await act(async () => {});

    await pinBothFavorites();

    expect(
      screen.getByRole("heading", { name: "즐겨찾기 출발" }),
    ).toBeInTheDocument();
    expect(favoriteIdentity("강동05 · 강동공영차고지")).toBeInTheDocument();
    expect(favoriteIdentity("2호선 · 강남방면")).toBeInTheDocument();
    // Opposite-direction display twins never reach the board.
    expect(screen.queryByText("강동05 · 암사역 방면")).not.toBeInTheDocument();
    expect(screen.queryByText("2호선 · 성수방면")).not.toBeInTheDocument();

    await authorProcedureThroughEditor();

    expect(screen.getByRole("heading", { name: "출근 루틴" })).toBeInTheDocument();
    expect(screen.getByText("11:01까지 출발")).toBeInTheDocument();
    expect(screen.getByText("11:49 도착")).toBeInTheDocument();
    expect(screen.getAllByText("실시간").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(/3분 걷기/)).toBeInTheDocument();

    firstVisit.unmount();
    render(<App />);
    await act(async () => {});

    expect(screen.getByRole("heading", { name: "출근 루틴" })).toBeInTheDocument();
    expect(screen.getByText("11:01까지 출발")).toBeInTheDocument();
    expect(screen.getByText("11:49 도착")).toBeInTheDocument();
    expect(favoriteIdentity("강동05 · 강동공영차고지")).toBeInTheDocument();
  });

  it("updates leave-by and destination ETA when the visible 30-second refresh returns changed data", async () => {
    seedDailyCommute();
    render(<App />);
    await act(async () => {});

    expect(screen.getByText("11:01까지 출발")).toBeInTheDocument();
    expect(screen.getByText("11:49 도착")).toBeInTheDocument();

    vi.mocked(fetchArrivals).mockImplementation(async () => busFlowPayload(660));
    vi.mocked(fetchSubwayArrivals).mockImplementation(async () =>
      subwayFlowPayload(60, 1560),
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });

    expect(screen.getByText("11:07까지 출발")).toBeInTheDocument();
    expect(screen.getByText("11:45 도착")).toBeInTheDocument();
  });

  it("refreshes once per 30 seconds while visible, pauses when hidden, and resumes on visibility and reconnect", async () => {
    seedDailyCommute();
    render(<App />);
    await act(async () => {});

    // Deduplicated: the shared controller issues exactly one call per
    // endpoint; the covered detail panel adds none.
    const busCalls = vi.mocked(fetchArrivals).mock.calls.length;
    const subwayCalls = vi.mocked(fetchSubwayArrivals).mock.calls.length;
    expect(busCalls).toBe(1);
    expect(subwayCalls).toBe(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(vi.mocked(fetchArrivals).mock.calls.length).toBe(busCalls + 1);
    expect(vi.mocked(fetchSubwayArrivals).mock.calls.length).toBe(
      subwayCalls + 1,
    );

    setDocumentVisibility("hidden");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(65_000);
    });
    expect(vi.mocked(fetchArrivals).mock.calls.length).toBe(busCalls + 1);
    expect(vi.mocked(fetchSubwayArrivals).mock.calls.length).toBe(
      subwayCalls + 1,
    );

    setDocumentVisibility("visible");
    await act(async () => {});
    expect(vi.mocked(fetchArrivals).mock.calls.length).toBe(busCalls + 2);
    expect(vi.mocked(fetchSubwayArrivals).mock.calls.length).toBe(
      subwayCalls + 2,
    );

    window.dispatchEvent(new Event("online"));
    await act(async () => {});
    expect(vi.mocked(fetchArrivals).mock.calls.length).toBe(busCalls + 3);
    expect(vi.mocked(fetchSubwayArrivals).mock.calls.length).toBe(
      subwayCalls + 3,
    );
  });

  it("preserves the saved procedure and last result when one source fails, marking only that data stale with manual retry", async () => {
    seedDailyCommute();
    render(<App />);
    await act(async () => {});
    expect(screen.getByText("11:01까지 출발")).toBeInTheDocument();

    vi.mocked(fetchArrivals).mockRejectedValue(new Error("upstream down"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });

    expect(screen.getByText("갱신 실패 · 오래된 정보")).toBeInTheDocument();
    expect(favoriteIdentity("2호선 · 강남방면")).toBeInTheDocument();
    expect(screen.getByText("오래됨")).toBeInTheDocument();
    expect(screen.queryByText(/까지 출발/)).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "출근 루틴" })).toBeInTheDocument();
    expect(screen.getByText("11:49 도착")).toBeInTheDocument();

    vi.mocked(fetchArrivals).mockImplementation(async () => busFlowPayload(300));
    fireEvent.click(
      screen.getByRole("button", { name: "즐겨찾기 도착정보 새로고침" }),
    );
    await act(async () => {});

    expect(screen.queryByText("갱신 실패 · 오래된 정보")).not.toBeInTheDocument();
    expect(screen.getByText(/까지 출발/)).toBeInTheDocument();
  });

  it("keeps a migrated legacy draft non-evaluable until the user completes it", async () => {
    localStorage.setItem(
      "commute-bus-web:stops:v3",
      JSON.stringify({
        company: {
          places: [
            {
              id: "company-v3",
              name: "회사",
              stops: [companyStop],
              subwayStations: [subwayStation],
              selectedStopId: companyStop.id,
              routeOptions: [
                {
                  id: "opt-a",
                  startStopId: companyStop.id,
                  transferStationId: subwayStation.id,
                },
              ],
              activeRouteOptionId: "opt-a",
            },
          ],
          activePlaceId: "company-v3",
        },
        home: {
          places: [
            {
              id: "home-v3",
              name: "집",
              stops: [],
              subwayStations: [],
              selectedStopId: null,
              routeOptions: [],
              activeRouteOptionId: null,
            },
          ],
          activePlaceId: "home-v3",
        },
      }),
    );
    render(<App />);
    await act(async () => {});

    expect(screen.getByText("이전 버전 루트")).toBeInTheDocument();
    expect(screen.getByText("설정 필요")).toBeInTheDocument();
    expect(screen.queryByText(/까지 출발/)).not.toBeInTheDocument();

    await pinBothFavorites();
    fireEvent.click(
      screen.getByRole("button", { name: "이전 버전 루트 절차 편집" }),
    );
    await act(async () => {});

    expect(
      screen.getByRole("button", { name: "절차 저장" }),
    ).toBeDisabled();

    fireEvent.change(screen.getByLabelText("절차 이름"), {
      target: { value: "마이그레이션 루틴" },
    });
    await selectFavoriteOption("1번째 버스 서비스", `강동05 · ${BUS_DIRECTION}`);
    fireEvent.change(screen.getByLabelText("1번째 버스 탑승 시간 (분)"), {
      target: { value: "15" },
    });
    fireEvent.change(screen.getByLabelText("1번째 버스 대기 대안 시간 (분)"), {
      target: { value: "10" },
    });
    await selectFavoriteOption("2번째 지하철 서비스", "2호선 · 강남방면");
    fireEvent.change(screen.getByLabelText("2번째 지하철 탑승 시간 (분)"), {
      target: { value: "20" },
    });
    fireEvent.change(screen.getByLabelText("2번째 지하철 대기 대안 시간 (분)"), {
      target: { value: "5" },
    });

    fireEvent.click(screen.getByRole("button", { name: "절차 저장" }));
    await act(async () => {});

    expect(
      screen.getByRole("heading", { name: "마이그레이션 루틴" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("설정 필요")).not.toBeInTheDocument();
    expect(screen.getByText(/까지 출발/)).toBeInTheDocument();
  });

  it("does not mutate saved procedures when the editor is cancelled", async () => {
    seedDailyCommute();
    render(<App />);
    await act(async () => {});

    fireEvent.click(
      screen.getByRole("button", { name: "출근 루틴 절차 편집" }),
    );
    await act(async () => {});
    fireEvent.change(screen.getByLabelText("절차 이름"), {
      target: { value: "임시 절차" },
    });
    fireEvent.click(screen.getByRole("button", { name: "편집 취소" }));
    await act(async () => {});

    expect(screen.queryByText("임시 절차")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "출근 루틴" })).toBeInTheDocument();
    expect(screen.getByText("11:01까지 출발")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "절차 추가" }));
    fireEvent.click(screen.getByRole("button", { name: "도보 추가" }));
    fireEvent.click(screen.getByRole("button", { name: "편집 취소" }));
    await act(async () => {});

    expect(screen.getByText("1개 저장됨")).toBeInTheDocument();
    expect(screen.queryByLabelText("1번째 도보 시간 (분)")).not.toBeInTheDocument();
  });

  it("isolates procedures and favorites per direction and place", async () => {
    seedDailyCommute();
    render(<App />);
    await act(async () => {});
    expect(screen.getByText("11:01까지 출발")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "집으로" }));
    await act(async () => {});

    expect(screen.queryByRole("heading", { name: "출근 루틴" })).not.toBeInTheDocument();
    expect(screen.queryByText("11:01까지 출발")).not.toBeInTheDocument();
    expect(screen.queryByText("즐겨찾기 출발")).not.toBeInTheDocument();
    expect(
      screen.getByText("저장한 통근 절차가 없습니다."),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "회사로" }));
    await act(async () => {});

    expect(screen.getByRole("heading", { name: "출근 루틴" })).toBeInTheDocument();
    expect(screen.getByText("11:01까지 출발")).toBeInTheDocument();
    expect(favoriteIdentity("강동05 · 강동공영차고지")).toBeInTheDocument();
  });
});

describe("App repair epoch 1: map/detail integration", () => {
  beforeEach(() => {
    localStorage.clear();
    matchMediaMatches = false;
    vi.useFakeTimers({ now: FLOW_NOW });
    vi.mocked(fetchArrivals).mockReset();
    vi.mocked(fetchSubwayArrivals).mockReset();
    vi.mocked(fetchNearbyStops).mockReset();
    vi.mocked(fetchArrivals).mockImplementation(async () => busFlowPayload(300));
    vi.mocked(fetchSubwayArrivals).mockImplementation(async () =>
      subwayFlowPayload(120, 1800),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("opens and closes the subway detail from the map marker and syncs marker/rail selected state", async () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "지하철역 추가" }));
    fireEvent.click(screen.getByRole("button", { name: "테스트 지하철역 저장" }));
    await act(async () => {});

    const marker = screen.getByRole("button", { name: "천호 지하철역 마커" });
    fireEvent.click(marker);
    await act(async () => {});

    expect(
      screen.getByRole("heading", { name: "천호 도착 예정" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "천호 지하철역 마커" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByRole("button", { name: "천호 지하철역 수도권 전철" }),
    ).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByRole("button", { name: "천호 지하철역 마커" }));
    await act(async () => {});
    expect(screen.queryByText("천호 도착 예정")).toBeNull();
    expect(
      screen.getByRole("button", { name: "천호 지하철역 마커" }),
    ).not.toHaveAttribute("aria-pressed", "true");
  });

  it("activates the subway marker through the keyboard and mirrors the rail row", async () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "지하철역 추가" }));
    fireEvent.click(screen.getByRole("button", { name: "테스트 지하철역 저장" }));
    await act(async () => {});

    fireEvent.keyDown(
      screen.getByRole("button", { name: "천호 지하철역 마커" }),
      { key: "Enter" },
    );
    await act(async () => {});

    expect(
      screen.getByRole("heading", { name: "천호 도착 예정" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "천호 지하철역 마커" }),
    ).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(
      screen.getByRole("button", { name: "천호 지하철역 수도권 전철" }),
    );
    await act(async () => {});
    expect(
      screen.getByRole("button", { name: "천호 지하철역 마커" }),
    ).not.toHaveAttribute("aria-pressed", "true");
  });

  it("reuses the shared live snapshot for the bus detail instead of a second overlapping request", async () => {
    seedDailyCommute();
    render(<App />);
    await act(async () => {});

    // The shared controller fetched the endpoint exactly once; the detail
    // panel (selected stop is part of the live query set) must not add a call.
    expect(
      vi.mocked(fetchArrivals).mock.calls.filter(
        (call) => call[0] === companyStop.arsId,
      ),
    ).toHaveLength(1);
    // Both payload rows render from the shared snapshot itself.
    expect(screen.getAllByText("강동05").length).toBeGreaterThanOrEqual(2);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    // One visible refresh cycle, still exactly one call per cycle per endpoint.
    expect(
      vi.mocked(fetchArrivals).mock.calls.filter(
        (call) => call[0] === companyStop.arsId,
      ),
    ).toHaveLength(2);
  });

  it("reuses the shared live snapshot for the subway detail instead of a second overlapping request", async () => {
    seedDailyCommute();
    render(<App />);
    await act(async () => {});

    fireEvent.click(
      screen.getByRole("button", { name: "천호 지하철역 수도권 전철" }),
    );
    await act(async () => {});

    expect(
      screen.getByRole("heading", { name: "천호 도착 예정" }),
    ).toBeInTheDocument();
    expect(
      vi.mocked(fetchSubwayArrivals).mock.calls.filter(
        (call) => call[0] === subwayStation.name,
      ),
    ).toHaveLength(1);
    expect(screen.getAllByText("2호선").length).toBeGreaterThanOrEqual(1);
  });

  it("still fetches full detail for points outside the live query set", async () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "버스 정류장 추가" }));
    fireEvent.click(screen.getByRole("button", { name: "테스트 회사 정류장 저장" }));
    await act(async () => {});
    fireEvent.click(screen.getByRole("button", { name: "지하철역 추가" }));
    fireEvent.click(screen.getByRole("button", { name: "테스트 지하철역 저장" }));
    await act(async () => {});

    // No favorites/procedure: neither point is in the live query set, so the
    // detail fetches are the only calls.
    expect(
      vi.mocked(fetchArrivals).mock.calls.filter(
        (call) => call[0] === companyStop.arsId,
      ),
    ).toHaveLength(1);
    fireEvent.click(
      screen.getByRole("button", { name: "천호 지하철역 수도권 전철" }),
    );
    await act(async () => {});
    expect(
      vi.mocked(fetchSubwayArrivals).mock.calls.filter(
        (call) => call[0] === subwayStation.name,
      ),
    ).toHaveLength(1);
  });

  it("switching direction or place does not duplicate detail or live calls", async () => {
    seedDailyCommute();
    render(<App />);
    await act(async () => {});

    fireEvent.click(screen.getByRole("tab", { name: "집으로" }));
    await act(async () => {});
    // Empty home collection: no queries, no detail calls.
    expect(vi.mocked(fetchArrivals).mock.calls).toHaveLength(1);
    expect(vi.mocked(fetchSubwayArrivals).mock.calls).toHaveLength(1);

    fireEvent.click(screen.getByRole("tab", { name: "회사로" }));
    await act(async () => {});
    expect(
      vi.mocked(fetchArrivals).mock.calls.filter(
        (call) => call[0] === companyStop.arsId,
      ),
    ).toHaveLength(2);
    expect(
      vi.mocked(fetchSubwayArrivals).mock.calls.filter(
        (call) => call[0] === subwayStation.name,
      ),
    ).toHaveLength(2);
  });

  it("keeps a single shared call per cycle when a partial failure marks the detail stale and retry recovers", async () => {
    seedDailyCommute();
    render(<App />);
    await act(async () => {});

    vi.mocked(fetchArrivals).mockRejectedValue(new Error("upstream down"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(
      vi.mocked(fetchArrivals).mock.calls.filter(
        (call) => call[0] === companyStop.arsId,
      ),
    ).toHaveLength(2);

    vi.mocked(fetchArrivals).mockImplementation(async () => busFlowPayload(300));
    fireEvent.click(
      screen.getByRole("button", { name: "도착정보 새로고침" }),
    );
    await act(async () => {});
    expect(
      vi.mocked(fetchArrivals).mock.calls.filter(
        (call) => call[0] === companyStop.arsId,
      ),
    ).toHaveLength(3);
    expect(screen.getAllByText("강동05").length).toBeGreaterThanOrEqual(2);
  });

  it("scrolls only the place-chip rail when a new place activates and leaves the document at top", async () => {
    render(<App />);

    for (const name of ["회사 2", "회사 3", "회사 4"]) {
      fireEvent.change(screen.getByRole("textbox", { name: "새 회사 이름" }), {
        target: { value: name },
      });
      fireEvent.click(screen.getByRole("button", { name: "회사 추가" }));
      await act(async () => {});
    }

    expect(
      screen.getByRole("button", { name: "회사 4, 절차 0개" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(scrollIntoView).not.toHaveBeenCalled();
    expect(window.scrollY).toBe(0);
    expect(document.documentElement.scrollTop).toBe(0);
  });
});

describe("App selected subway rail row", () => {
  beforeEach(() => {
    localStorage.clear();
    matchMediaMatches = false;
    vi.useFakeTimers({ now: FLOW_NOW });
    vi.mocked(fetchArrivals).mockReset();
    vi.mocked(fetchSubwayArrivals).mockReset();
    vi.mocked(fetchArrivals).mockImplementation(async () => busFlowPayload(300));
    vi.mocked(fetchSubwayArrivals).mockImplementation(async () =>
      subwayFlowPayload(120, 1800),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("marks the enclosing subway row active and keeps the pointer affordance clickable", async () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "지하철역 추가" }));
    fireEvent.click(screen.getByRole("button", { name: "테스트 지하철역 저장" }));
    await act(async () => {});

    fireEvent.click(
      screen.getByRole("button", { name: "천호 지하철역 수도권 전철" }),
    );
    await act(async () => {});

    const railButton = screen.getByRole("button", {
      name: "천호 지하철역 수도권 전철",
    });
    const row = railButton.closest(".saved-stop-row");
    expect(row).not.toBeNull();
    expect(row?.className).toContain("is-active");
    expect(row?.className).toContain("is-subway");
    // Machine-consumed pointer affordance: the interactive row is a button
    // and no stylesheet rule keeps `cursor: default` on subway choices
    // (jsdom does not cascade linked CSS, so the rule is inspected directly).
    expect(railButton.tagName).toBe("BUTTON");
    const cursorDefaultRules = [...document.styleSheets]
      .flatMap((sheet) => {
        try {
          return [...sheet.cssRules];
        } catch {
          return [];
        }
      })
      .filter(
        (rule) =>
          rule instanceof CSSStyleRule &&
          rule.selectorText.includes("saved-stop-choice") &&
          rule.style.cursor === "default",
      );
    expect(cursorDefaultRules).toEqual([]);

    // Marker/rail synchronization still holds through the same state.
    expect(
      screen.getByRole("button", { name: "천호 지하철역 마커" }),
    ).toHaveAttribute("aria-pressed", "true");
  });
});
