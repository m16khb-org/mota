// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import type { BusStop } from "../domain/bus";
import type { SubwayStation } from "../domain/subway";
import { useCommuteStops } from "./useCommuteStops";

const companyStop: BusStop = {
  id: "124000454" as BusStop["id"],
  arsId: "25014" as BusStop["arsId"],
  name: "천호역",
  lat: 37.5379482005,
  lng: 127.1255385876,
  distanceMeters: 151,
};

const secondCompanyStop: BusStop = {
  id: "124000455" as BusStop["id"],
  arsId: "25015" as BusStop["arsId"],
  name: "천호역현대백화점",
  lat: 37.5384,
  lng: 127.1249,
  distanceMeters: 203,
};

const homeStop: BusStop = {
  id: "124000120" as BusStop["id"],
  arsId: "25273" as BusStop["arsId"],
  name: "암사역",
  lat: 37.5509,
  lng: 127.1274,
  distanceMeters: 96,
};

const subwayStation: SubwayStation = {
  id: "osm-node-5801572034" as SubwayStation["id"],
  name: "천호",
  line: "수도권 전철",
  lat: 37.5385225,
  lng: 127.1234021,
  distanceMeters: 228,
};

describe("useCommuteStops", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("migrates the v1 single-stop format into a named place", async () => {
    localStorage.setItem(
      "commute-bus-web:stops:v1",
      JSON.stringify({ company: companyStop, home: null }),
    );

    const { result } = renderHook(() => useCommuteStops());
    const migratedPlace = result.current.commutes.company.places[0];

    expect(migratedPlace).toMatchObject({
      name: "회사 1",
      stops: [companyStop],
      selectedStopId: companyStop.id,
    });
    expect(result.current.commutes.company.activePlaceId).toBe(migratedPlace?.id);

    await waitFor(() => {
      const stored = localStorage.getItem("commute-bus-web:stops:v2");
      expect(stored).not.toBeNull();
      expect(JSON.parse(stored ?? "{}").company.places[0].stops).toEqual([
        companyStop,
      ]);
    });
  });

  it("stores multiple named places and multiple stops for each direction", () => {
    const { result } = renderHook(() => useCommuteStops());

    act(() => {
      result.current.addPlace("company", "강남 사무실");
    });
    const companyPlace = result.current.commutes.company.places.at(-1);
    expect(companyPlace?.name).toBe("강남 사무실");

    act(() => {
      if (!companyPlace) {
        throw new Error("Expected a company place");
      }
      result.current.addStop("company", companyPlace.id, companyStop);
      result.current.addStop("company", companyPlace.id, secondCompanyStop);
      result.current.addStop("company", companyPlace.id, companyStop);
      result.current.addPlace("home", "부모님 집");
    });
    const homePlace = result.current.commutes.home.places.at(-1);

    act(() => {
      if (!homePlace) {
        throw new Error("Expected a home place");
      }
      result.current.addStop("home", homePlace.id, homeStop);
    });

    expect(result.current.commutes.company.places).toHaveLength(2);
    expect(
      result.current.commutes.company.places.at(-1)?.stops,
    ).toEqual([companyStop, secondCompanyStop]);
    expect(result.current.commutes.home.places).toHaveLength(2);
    expect(result.current.commutes.home.places.at(-1)?.stops).toEqual([
      homeStop,
    ]);
  });

  it("keeps active selections valid when stops and places are removed", () => {
    const { result } = renderHook(() => useCommuteStops());
    const initialPlace = result.current.commutes.company.places[0];
    if (!initialPlace) {
      throw new Error("Expected the default company place");
    }

    act(() => {
      result.current.addStop("company", initialPlace.id, companyStop);
      result.current.addStop("company", initialPlace.id, secondCompanyStop);
      result.current.selectStop("company", initialPlace.id, companyStop.id);
      result.current.removeStop("company", initialPlace.id, companyStop.id);
    });

    expect(
      result.current.commutes.company.places[0]?.selectedStopId,
    ).toBe(secondCompanyStop.id);

    act(() => {
      result.current.addPlace("company", "판교 사무실");
    });
    const activePlaceId = result.current.commutes.company.activePlaceId;

    act(() => {
      if (!activePlaceId) {
        throw new Error("Expected an active company place");
      }
      result.current.removePlace("company", activePlaceId);
    });

    expect(result.current.commutes.company.activePlaceId).toBe(initialPlace.id);
  });

  it("persists deduplicated subway stations in each place route", async () => {
    const { result } = renderHook(() => useCommuteStops());
    const companyPlace = result.current.commutes.company.places[0];
    if (!companyPlace) {
      throw new Error("Expected the default company place");
    }

    act(() => {
      result.current.addSubwayStations("company", companyPlace.id, [
        subwayStation,
        subwayStation,
      ]);
    });

    expect(
      result.current.commutes.company.places[0]?.subwayStations,
    ).toEqual([subwayStation]);
    await waitFor(() => {
      const stored = localStorage.getItem("commute-bus-web:stops:v2");
      expect(JSON.parse(stored ?? "{}").company.places[0].subwayStations).toEqual(
        [subwayStation],
      );
    });

    act(() => {
      result.current.removeSubwayStation(
        "company",
        companyPlace.id,
        subwayStation.id,
      );
    });
    expect(
      result.current.commutes.company.places[0]?.subwayStations,
    ).toEqual([]);
  });
});
