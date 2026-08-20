// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BusStop } from "../domain/bus";
import { MapPicker } from "./MapPicker";

vi.mock("./MapCanvas", () => ({
  MapCanvas: ({
    center,
    stops,
    onCenterChange,
    onSelect,
  }: {
    center: { lat: number; lng: number };
    stops: readonly BusStop[];
    onCenterChange: (center: { lat: number; lng: number }) => void;
    onSelect: (stop: BusStop) => void;
  }) => (
    <>
      <button
        type="button"
        onClick={() => onCenterChange({ lat: center.lat + 0.001, lng: center.lng })}
      >
        테스트 지도 이동
      </button>
      {stops.map((stop) => (
        <button
          key={stop.id}
          type="button"
          aria-label={`지도 마커 ${stop.name}`}
          onClick={() => onSelect(stop)}
        />
      ))}
    </>
  ),
}));

const nearbyStop: BusStop = {
  id: "124000454" as BusStop["id"],
  arsId: "25014" as BusStop["arsId"],
  name: "천호역",
  lat: 37.5379482005,
  lng: 127.1255385876,
  distanceMeters: 151,
};

const secondNearbyStop: BusStop = {
  id: "124000455" as BusStop["id"],
  arsId: "25015" as BusStop["arsId"],
  name: "천호역현대백화점",
  lat: 37.5384,
  lng: 127.1249,
  distanceMeters: 203,
};

describe("MapPicker", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ stops: [nearbyStop] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
  });

  it("searches the current map center and saves an explicit stop selection", async () => {
    const onSave = vi.fn();
    render(<MapPicker initialStop={null} onClose={vi.fn()} onSave={onSave} />);

    fireEvent.click(screen.getByRole("button", { name: "테스트 지도 이동" }));
    fireEvent.click(screen.getByRole("button", { name: "이 위치에서 찾기" }));

    expect(await screen.findByText("천호역")).toBeInTheDocument();
    expect(screen.getByTestId("stop-result-summary")).toHaveAttribute("data-stop-count", "1");
    fireEvent.click(screen.getByRole("button", { name: /천호역.*25014/ }));
    fireEvent.click(screen.getByRole("button", { name: "선택한 1개 저장" }));

    expect(onSave).toHaveBeenCalledWith([nearbyStop]);
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining("lat=37.5376"),
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      ),
    );
  });

  it("keeps the picker actionable when the API fails", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 503 }));
    render(<MapPicker initialStop={null} onClose={vi.fn()} onSave={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "이 위치에서 찾기" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "정류장을 불러오지 못했습니다",
    );
    expect(screen.getByRole("button", { name: "이 위치에서 찾기" })).toBeEnabled();
  });

  it("explains when the search center is outside the Seoul service area", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "INVALID_LOCATION" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }),
    );
    render(<MapPicker initialStop={null} onClose={vi.fn()} onSave={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "이 위치에서 찾기" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "서울 서비스 범위 밖이에요",
    );
  });

  it("selects multiple stop markers before saving the route", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ stops: [nearbyStop, secondNearbyStop] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const onSave = vi.fn();
    render(<MapPicker initialStop={null} onClose={vi.fn()} onSave={onSave} />);

    fireEvent.click(screen.getByRole("button", { name: "이 위치에서 찾기" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "지도 마커 천호역" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "지도 마커 천호역현대백화점" }),
    );

    expect(
      screen.getByRole("button", { name: /천호역 정류장 25014/ }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByRole("button", { name: /천호역현대백화점 정류장 25015/ }),
    ).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "선택한 2개 저장" }));

    expect(onSave).toHaveBeenCalledWith([nearbyStop, secondNearbyStop]);
  });

  it("moves focus into the modal and closes with Escape", () => {
    const onClose = vi.fn();
    render(<MapPicker initialStop={null} onClose={onClose} onSave={vi.fn()} />);

    expect(screen.getByRole("button", { name: "닫기" })).toHaveFocus();
    fireEvent.keyDown(document, { key: "Escape" });

    expect(onClose).toHaveBeenCalledOnce();
  });
});
