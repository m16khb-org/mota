// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import type { BusStop } from "../domain/bus";
import type { SubwayStation } from "../domain/subway";
import type {
  CommuteFavoriteInput,
  CommuteProcedureInput,
} from "./commuteStopsSelectors";
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

const v3CompanyPlace = {
  id: "company-v3",
  name: "v3 회사",
  stops: [companyStop, secondCompanyStop],
  subwayStations: [subwayStation],
  selectedStopId: companyStop.id,
  routeOptions: [
    {
      id: "opt-a",
      startStopId: companyStop.id,
      transferStationId: null,
    },
    {
      id: "opt-b",
      startStopId: secondCompanyStop.id,
      transferStationId: subwayStation.id,
    },
  ],
  activeRouteOptionId: "opt-b",
};
const v3Payload = JSON.stringify({
  company: {
    places: [v3CompanyPlace],
    activePlaceId: "company-v3",
  },
  home: {
    places: [
      {
        id: "home-v3",
        name: "v3 집",
        stops: [homeStop],
        subwayStations: [],
        selectedStopId: homeStop.id,
        routeOptions: [
          {
            id: "home-opt",
            startStopId: homeStop.id,
            transferStationId: null,
          },
        ],
        activeRouteOptionId: "home-opt",
      },
    ],
    activePlaceId: "home-v3",
  },
});

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
      const stored = localStorage.getItem("commute-bus-web:stops:v4");
      expect(stored).not.toBeNull();
      expect(JSON.parse(stored ?? "{}").company.places[0].stops).toEqual([
        companyStop,
      ]);
    });
  });

  it("migrates v2 stops into explicit bus-only route options", async () => {
    localStorage.setItem(
      "commute-bus-web:stops:v2",
      JSON.stringify({
        company: {
          places: [
            {
              id: "company-legacy",
              name: "회사",
              stops: [companyStop, secondCompanyStop],
              subwayStations: [subwayStation],
              selectedStopId: secondCompanyStop.id,
            },
          ],
          activePlaceId: "company-legacy",
        },
        home: { places: [], activePlaceId: null },
      }),
    );

    const { result } = renderHook(() => useCommuteStops());
    const migratedPlace = result.current.commutes.company.places[0] as unknown as {
      routeOptions: Array<{
        id: string;
        startStopId: BusStop["id"];
        transferStationId: SubwayStation["id"] | null;
      }>;
      activeRouteOptionId: string | null;
    };

    expect(migratedPlace.routeOptions).toEqual([
      {
        id: `migrated-${companyStop.id}`,
        startStopId: companyStop.id,
        transferStationId: null,
      },
      {
        id: `migrated-${secondCompanyStop.id}`,
        startStopId: secondCompanyStop.id,
        transferStationId: null,
      },
    ]);
    expect(migratedPlace.activeRouteOptionId).toBe(
      `migrated-${secondCompanyStop.id}`,
    );

    await waitFor(() => {
      expect(localStorage.getItem("commute-bus-web:stops:v4")).not.toBeNull();
    });
  });

  describe("v1/v2/v3 storage baseline (characterization)", () => {
    const v2Payload = JSON.stringify({
      company: {
        places: [
          {
            id: "company-v2",
            name: "구버전 회사",
            stops: [homeStop],
            subwayStations: [],
            selectedStopId: homeStop.id,
          },
        ],
        activePlaceId: "company-v2",
      },
      home: { places: [], activePlaceId: null },
    });
    const v1Payload = JSON.stringify({
      company: companyStop,
      home: null,
    });

    it("prefers v3 over v2 and v1 and preserves persisted places, points, and selections", async () => {
      localStorage.setItem("commute-bus-web:stops:v3", v3Payload);
      localStorage.setItem("commute-bus-web:stops:v2", v2Payload);
      localStorage.setItem("commute-bus-web:stops:v1", v1Payload);

      const { result } = renderHook(() => useCommuteStops());
      const companyPlace = result.current.commutes.company.places[0];

      expect(companyPlace).toMatchObject({
        id: "company-v3",
        name: "v3 회사",
        stops: [companyStop, secondCompanyStop],
        subwayStations: [subwayStation],
      });
      // Current normalization forces selectedStopId onto the active option's
      // start stop, so the stored companyStop selection becomes opt-b's stop.
      expect(companyPlace?.selectedStopId).toBe(secondCompanyStop.id);
      expect(companyPlace?.routeOptions).toEqual(v3CompanyPlace.routeOptions);
      expect(companyPlace?.activeRouteOptionId).toBe("opt-b");
      expect(result.current.commutes.company.activePlaceId).toBe("company-v3");
      expect(result.current.commutes.home.places[0]).toMatchObject({
        id: "home-v3",
        name: "v3 집",
        stops: [homeStop],
      });
      expect(result.current.commutes.home.activePlaceId).toBe("home-v3");

      await waitFor(() => {
        const stored = localStorage.getItem("commute-bus-web:stops:v4");
        expect(stored).not.toBeNull();
        expect(JSON.parse(stored ?? "{}").company.places[0].name).toBe(
          "v3 회사",
        );
      });
      // Older keys are never rewritten or deleted by the current behavior.
      expect(localStorage.getItem("commute-bus-web:stops:v2")).toBe(
        v2Payload,
      );
      expect(localStorage.getItem("commute-bus-web:stops:v1")).toBe(
        v1Payload,
      );
    });

    it("prefers v2 over v1 when v3 is absent", () => {
      localStorage.setItem("commute-bus-web:stops:v2", v2Payload);
      localStorage.setItem("commute-bus-web:stops:v1", v1Payload);

      const { result } = renderHook(() => useCommuteStops());
      const companyPlace = result.current.commutes.company.places[0];

      expect(companyPlace).toMatchObject({
        id: "company-v2",
        name: "구버전 회사",
        stops: [homeStop],
      });
      // The v1 company stop must not leak into the v2-won state.
      expect(
        companyPlace?.stops.some((stop) => stop.id === companyStop.id),
      ).toBe(false);
      // Current v2 migration synthesizes one bus-only option per stop.
      expect(companyPlace?.routeOptions).toEqual([
        {
          id: `migrated-${homeStop.id}`,
          startStopId: homeStop.id,
          transferStationId: null,
        },
      ]);
    });

    it("cleans migrated route options when their referenced points are deleted", async () => {
      localStorage.setItem("commute-bus-web:stops:v3", v3Payload);
      const { result } = renderHook(() => useCommuteStops());

      act(() => {
        result.current.removeSubwayStation(
          "company",
          "company-v3",
          subwayStation.id,
        );
      });
      let place = result.current.commutes.company.places[0];
      // opt-b referenced the deleted station; the bus-only opt-a survives.
      expect(place?.routeOptions.map((option) => option.id)).toEqual(["opt-a"]);
      expect(place?.activeRouteOptionId).toBe("opt-a");

      act(() => {
        result.current.removeStop("company", "company-v3", companyStop.id);
      });
      place = result.current.commutes.company.places[0];
      expect(place?.routeOptions).toEqual([]);

      await waitFor(() => {
        const stored = JSON.parse(
          localStorage.getItem("commute-bus-web:stops:v4") ?? "{}",
        );
        expect(stored.company.places[0].routeOptions).toHaveLength(0);
      });
    });
  });

  describe("v4 procedures and favorites", () => {
    const fiveSteps: CommuteProcedureInput["steps"] = [
      { id: "s1", kind: "walk", minutes: 4 },
      {
        id: "s2",
        kind: "bus",
        stopId: companyStop.id,
        arsId: companyStop.arsId,
        routeId: "100100574",
        routeName: "341",
        direction: "강동공영차고지",
        rideMinutes: 18,
        fallbackWaitMinutes: 7,
      },
      { id: "s3", kind: "walk", minutes: 3 },
      {
        id: "s4",
        kind: "subway",
        stationId: subwayStation.id,
        apiStationName: "천호(풍납토성)",
        subwayId: "1002",
        updnLine: "하행",
        lineName: "8호선",
        trainLineNm: "강남방면",
        rideMinutes: 22,
        fallbackWaitMinutes: 6,
      },
      { id: "s5", kind: "walk", minutes: 4 },
    ];

    const busFavoriteInput: CommuteFavoriteInput = {
      kind: "bus",
      stopId: companyStop.id,
      arsId: companyStop.arsId,
      routeId: "100100574",
      routeName: "341",
      direction: "강동공영차고지",
      accessMinutes: 6,
    };
    const subwayFavoriteInput: CommuteFavoriteInput = {
      kind: "subway",
      stationId: subwayStation.id,
      apiStationName: "천호(풍납토성)",
        subwayId: "1002",
      updnLine: "하행",
      lineName: "8호선",
      trainLineNm: "강남방면",
      accessMinutes: 8,
    };

    function setupActivePlace() {
      const { result } = renderHook(() => useCommuteStops());
      const placeId = result.current.commutes.company.places[0]?.id;
      if (!placeId) {
        throw new Error("Expected the default company place");
      }
      act(() => {
        result.current.addStop("company", placeId, companyStop);
        result.current.addStop("company", placeId, secondCompanyStop);
        result.current.addSubwayStations("company", placeId, [subwayStation]);
      });
      return { result, placeId };
    }

    it("writes v4 with migrated drafts while leaving the stored v3 payload untouched", async () => {
      localStorage.setItem("commute-bus-web:stops:v3", v3Payload);

      const { result } = renderHook(() => useCommuteStops());
      expect(result.current.commutes.company.places[0]?.procedures).toEqual([
        {
          id: "opt-a",
          kind: "legacy-draft",
          stopId: companyStop.id,
          stationId: null,
        },
        {
          id: "opt-b",
          kind: "legacy-draft",
          stopId: secondCompanyStop.id,
          stationId: subwayStation.id,
        },
      ]);

      await waitFor(() => {
        const stored = localStorage.getItem("commute-bus-web:stops:v4");
        expect(stored).not.toBeNull();
        const parsed = JSON.parse(stored ?? "{}");
        expect(parsed.company.places[0].procedures).toHaveLength(2);
        expect(parsed.company.places[0].activeProcedureId).toBe("opt-b");
      });
      expect(localStorage.getItem("commute-bus-web:stops:v3")).toBe(v3Payload);
    });

    it("adds, dedupes, reorders, selects, edits, and removes procedures deterministically", () => {
      const { result, placeId } = setupActivePlace();

      act(() => {
        result.current.addProcedure("company", placeId, {
          name: "아침 출근",
          steps: fiveSteps,
        });
      });
      const firstProcedure =
        result.current.commutes.company.places[0]?.procedures[0];
      expect(firstProcedure).toMatchObject({ kind: "ready", name: "아침 출근" });
      expect(
        result.current.commutes.company.places[0]?.activeProcedureId,
      ).toBe(firstProcedure?.id);

      act(() => {
        result.current.addProcedure("company", placeId, {
          name: "아침 출근",
          steps: fiveSteps,
        });
      });
      expect(
        result.current.commutes.company.places[0]?.procedures,
      ).toHaveLength(1);

      act(() => {
        result.current.addProcedure("company", placeId, {
          name: "퇴근 길",
          steps: [{ id: "w1", kind: "walk", minutes: 12 }],
        });
      });
      const place = result.current.commutes.company.places[0];
      const procedures = place?.procedures ?? [];
      expect(
        procedures.map((procedure) =>
          procedure.kind === "ready" ? procedure.name : procedure.kind,
        ),
      ).toEqual(["아침 출근", "퇴근 길"]);
      expect(place?.activeProcedureId).toBe(procedures[1]?.id);

      act(() => {
        result.current.reorderProcedure(
          "company",
          placeId,
          procedures[0]?.id as never,
          1,
        );
      });
      expect(
        result.current.commutes.company.places[0]?.procedures.map(
          (procedure) =>
            procedure.kind === "ready" ? procedure.name : procedure.kind,
        ),
      ).toEqual(["퇴근 길", "아침 출근"]);
      // Reordering never changes the active procedure.
      expect(
        result.current.commutes.company.places[0]?.activeProcedureId,
      ).toBe(procedures[1]?.id);

      act(() => {
        result.current.selectProcedure(
          "company",
          placeId,
          procedures[1]?.id as never,
        );
      });
      expect(
        result.current.commutes.company.places[0]?.activeProcedureId,
      ).toBe(procedures[1]?.id);

      act(() => {
        result.current.editProcedure(
          "company",
          placeId,
          procedures[0]?.id as never,
          { name: "아침 출근 바뀜", steps: fiveSteps },
        );
      });
      const edited =
        result.current.commutes.company.places[0]?.procedures[1];
      expect(edited).toMatchObject({
        id: procedures[0]?.id,
        name: "아침 출근 바뀜",
      });

      act(() => {
        result.current.removeProcedure(
          "company",
          placeId,
          procedures[0]?.id as never,
        );
      });
      expect(
        result.current.commutes.company.places[0]?.procedures,
      ).toHaveLength(1);
      expect(
        result.current.commutes.company.places[0]?.activeProcedureId,
      ).toBe(procedures[1]?.id);

      act(() => {
        result.current.removeProcedure(
          "company",
          placeId,
          procedures[1]?.id as never,
        );
      });
      expect(
        result.current.commutes.company.places[0]?.procedures,
      ).toEqual([]);
      expect(
        result.current.commutes.company.places[0]?.activeProcedureId,
      ).toBeNull();
    });

    it("rejects invalid procedure input at the mutation boundary", () => {
      const { result, placeId } = setupActivePlace();
      const busStep = fiveSteps[1];
      if (!busStep) {
        throw new Error("Expected the bus step fixture");
      }

      expect(() =>
        act(() => {
          result.current.addProcedure("company", placeId, {
            name: "잘못된 절차",
            steps: [
              { id: "s1", kind: "walk", minutes: 0 },
              { ...busStep, id: "s1" },
            ],
          });
        }),
      ).toThrow();
      expect(() =>
        act(() => {
          result.current.editProcedure("company", placeId, "missing" as never, {
            name: "존재하지 않음",
            steps: fiveSteps,
          });
        }),
      ).not.toThrow();
      expect(
        result.current.commutes.company.places[0]?.procedures,
      ).toEqual([]);
    });

    it("pins, dedupes, updates, and unpins exact favorites", () => {
      const { result, placeId } = setupActivePlace();

      act(() => {
        result.current.pinFavorite("company", placeId, busFavoriteInput);
        result.current.pinFavorite("company", placeId, subwayFavoriteInput);
        result.current.pinFavorite("company", placeId, busFavoriteInput);
      });
      const place = result.current.commutes.company.places[0];
      expect(place?.favorites).toEqual([
        { ...busFavoriteInput, id: place?.favorites[0]?.id },
        { ...subwayFavoriteInput, id: place?.favorites[1]?.id },
      ]);

      const busFavoriteId = place?.favorites[0]?.id as never;
      act(() => {
        result.current.updateFavorite("company", placeId, busFavoriteId, {
          ...busFavoriteInput,
          accessMinutes: 11,
        });
      });
      expect(
        result.current.commutes.company.places[0]?.favorites[0],
      ).toMatchObject({ id: busFavoriteId, accessMinutes: 11 });

      expect(() =>
        act(() => {
          result.current.updateFavorite("company", placeId, busFavoriteId, {
            ...busFavoriteInput,
            accessMinutes: 0,
          });
        }),
      ).toThrow();

      act(() => {
        result.current.unpinFavorite("company", placeId, busFavoriteId);
      });
      expect(
        result.current.commutes.company.places[0]?.favorites.map(
          (favorite) => favorite.kind,
        ),
      ).toEqual(["subway"]);
    });

    it("cleans referencing procedures, drafts, and favorites when points are deleted", () => {
      localStorage.setItem("commute-bus-web:stops:v3", v3Payload);
      const { result } = renderHook(() => useCommuteStops());
      const placeId = result.current.commutes.company.places[0]?.id as string;

      act(() => {
        result.current.addProcedure("company", placeId, {
          name: "아침 출근",
          steps: fiveSteps,
        });
        result.current.pinFavorite("company", placeId, busFavoriteInput);
        result.current.pinFavorite("company", placeId, subwayFavoriteInput);
      });
      const before = result.current.commutes.company.places[0];
      expect(before?.procedures.map((procedure) => procedure.kind)).toEqual([
        "legacy-draft",
        "legacy-draft",
        "ready",
      ]);
      expect(before?.favorites).toHaveLength(2);

      act(() => {
        result.current.removeStop("company", placeId, companyStop.id);
      });
      const afterStopRemoval =
        result.current.commutes.company.places[0];
      expect(
        afterStopRemoval?.procedures.map((procedure) => procedure.id),
      ).toEqual(["opt-b"]);
      expect(
        afterStopRemoval?.favorites.map((favorite) => favorite.kind),
      ).toEqual(["subway"]);
      expect(afterStopRemoval?.activeProcedureId).toBe("opt-b");
      expect(
        afterStopRemoval?.stops.map((stop) => stop.id),
      ).toEqual([secondCompanyStop.id]);

      act(() => {
        result.current.removeSubwayStation(
          "company",
          placeId,
          subwayStation.id,
        );
      });
      const afterStationRemoval =
        result.current.commutes.company.places[0];
      // opt-b keeps its surviving stop reference; the station-only references
      // (route option transfer, subway favorite) are gone.
      expect(afterStationRemoval?.procedures).toEqual([
        {
          id: "opt-b",
          kind: "legacy-draft",
          stopId: secondCompanyStop.id,
          stationId: null,
        },
      ]);
      expect(afterStationRemoval?.favorites).toEqual([]);
      expect(afterStationRemoval?.activeProcedureId).toBe("opt-b");
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
      const stored = localStorage.getItem("commute-bus-web:stops:v4");
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
