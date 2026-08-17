// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { fetchArrivals } from "./api/client";
import type { BusStop } from "./domain/bus";

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

vi.mock("./components/MapPicker", () => ({
  MapPicker: ({ onSave }: { onSave: (stop: BusStop) => void }) => (
    <>
      <button type="button" onClick={() => onSave(companyStop)}>
        테스트 회사 정류장 저장
      </button>
      <button type="button" onClick={() => onSave(homeStop)}>
        테스트 집 정류장 저장
      </button>
    </>
  ),
}));

vi.mock("./components/MapCanvas", () => ({
  MapCanvas: ({ stops }: { stops: readonly BusStop[] }) => (
    <section
      aria-label="통근 정류장 지도"
      data-stop-count={stops.length}
    />
  ),
}));

vi.mock("./api/client", async (importOriginal) => {
  const original = await importOriginal<typeof import("./api/client")>();
  return {
    ...original,
    fetchArrivals: vi.fn(),
  };
});

describe("App company commute", () => {
  beforeEach(() => {
    localStorage.clear();
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
    fireEvent.click(screen.getByRole("button", { name: "지도에서 정류장 선택" }));
    fireEvent.click(screen.getByRole("button", { name: "테스트 회사 정류장 저장" }));

    expect(await screen.findByText("천호역")).toBeInTheDocument();
    expect(screen.getByTestId("save-announcement")).toHaveTextContent("천호역");
    expect(await screen.findByText("강동05")).toBeInTheDocument();
    expect(screen.getByText("3분")).toBeInTheDocument();
    await waitFor(() => expect(fetchArrivals).toHaveBeenCalledWith(companyStop.arsId));
  });

  it("keeps the home-bound stop separate from the company-bound stop", async () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "지도에서 정류장 선택" }));
    fireEvent.click(screen.getByRole("button", { name: "테스트 회사 정류장 저장" }));
    expect(await screen.findByText("천호역")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "집으로" }));
    expect(screen.getByRole("button", { name: "지도에서 정류장 선택" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "지도에서 정류장 선택" }));
    fireEvent.click(screen.getByRole("button", { name: "테스트 집 정류장 저장" }));
    expect(await screen.findByText("암사역")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "회사로" }));
    expect(screen.getByText("천호역")).toBeInTheDocument();
    expect(screen.queryByText("암사역")).not.toBeInTheDocument();
  });

  it("restores selected commute stops on the next visit", async () => {
    const firstVisit = render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "지도에서 정류장 선택" }));
    fireEvent.click(screen.getByRole("button", { name: "테스트 회사 정류장 저장" }));
    expect(await screen.findByText("천호역")).toBeInTheDocument();
    firstVisit.unmount();

    render(<App />);
    expect(screen.getByText("천호역")).toBeInTheDocument();
    await waitFor(() => expect(fetchArrivals).toHaveBeenCalledWith(companyStop.arsId));
  });
});
