/** @vitest-environment jsdom */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { BusStop } from "../domain/bus";
import type { SubwayStation } from "../domain/subway";
import type { CommutePlace } from "../hooks/useCommuteStops";
import { RouteOptionList } from "./RouteOptionList";

const stop: BusStop = {
  id: "124000454" as BusStop["id"],
  arsId: "25014" as BusStop["arsId"],
  name: "천호역 정류장",
  lat: 37.5379,
  lng: 127.1255,
  distanceMeters: 151,
};

const station: SubwayStation = {
  id: "osm-node-5801572034" as SubwayStation["id"],
  name: "천호역",
  line: "5·8호선",
  lat: 37.5385,
  lng: 127.1234,
  distanceMeters: 228,
};

const place: CommutePlace = {
  id: "company-1",
  name: "회사",
  stops: [stop],
  subwayStations: [station],
  selectedStopId: stop.id,
  routeOptions: [],
  activeRouteOptionId: null,
};

describe("RouteOptionList", () => {
  it("saves an explicit stop-to-station route", () => {
    const onAdd = vi.fn();
    render(
      <RouteOptionList
        place={place}
        waits={[]}
        onAdd={onAdd}
        onRemove={vi.fn()}
        onSelect={vi.fn()}
        onRefresh={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText("출발 정류장"), {
      target: { value: stop.id },
    });
    fireEvent.change(screen.getByLabelText("환승역"), {
      target: { value: station.id },
    });
    fireEvent.click(screen.getByRole("button", { name: "루트 저장" }));

    expect(onAdd).toHaveBeenCalledWith(stop.id, station.id);
  });
});
