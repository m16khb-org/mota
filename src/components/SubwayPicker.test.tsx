// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SubwayStation } from "../domain/subway";
import { SubwayPicker } from "./SubwayPicker";

const stations: readonly SubwayStation[] = [
  {
    id: "osm-node-5801572034" as SubwayStation["id"],
    name: "천호",
    line: "수도권 전철",
    lat: 37.5385225,
    lng: 127.1234021,
    distanceMeters: 228,
  },
  {
    id: "osm-node-5451488269" as SubwayStation["id"],
    name: "암사역사공원",
    line: "수도권 전철",
    lat: 37.5570469,
    lng: 127.1374318,
    distanceMeters: 2580,
  },
];

vi.mock("./MapCanvas", () => ({
  MapCanvas: ({
    subwayStations,
    onSelectSubway,
  }: {
    subwayStations: readonly SubwayStation[];
    onSelectSubway: (station: SubwayStation) => void;
  }) => (
    <>
      {subwayStations.map((station) => (
        <button
          key={station.id}
          type="button"
          aria-label={`지하철 마커 ${station.name}`}
          onClick={() => onSelectSubway(station)}
        />
      ))}
    </>
  ),
}));

describe("SubwayPicker", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({ stations }, { status: 200 }),
      ),
    );
  });

  it("selects multiple station markers and saves them as route points", async () => {
    const onSave = vi.fn();
    render(
      <SubwayPicker
        initialCenter={{ lat: 37.5366, lng: 127.1253 }}
        onClose={vi.fn()}
        onSave={onSave}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "이 위치에서 지하철역 찾기" }),
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "지하철 마커 천호" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "지하철 마커 암사역사공원" }),
    );

    expect(
      screen.getByRole("button", { name: /천호 지하철역/ }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByRole("button", { name: /암사역사공원 지하철역/ }),
    ).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "선택한 2개 저장" }));

    expect(onSave).toHaveBeenCalledWith(stations);
  });
});
