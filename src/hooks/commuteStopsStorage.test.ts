// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";
import type { BusStop } from "../domain/bus";
import { commuteProcedureSchema } from "../domain/commute";
import type { SubwayStation } from "../domain/subway";
import { loadCommutes, saveCommutes } from "./commuteStopsStorage";

const V4_KEY = "commute-bus-web:stops:v4";
const V3_KEY = "commute-bus-web:stops:v3";
const V2_KEY = "commute-bus-web:stops:v2";
const V1_KEY = "commute-bus-web:stops:v1";

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

const subwayStation: SubwayStation = {
  id: "osm-node-5801572034" as SubwayStation["id"],
  name: "천호",
  line: "수도권 전철",
  lat: 37.5385225,
  lng: 127.1234021,
  distanceMeters: 228,
};

const v3Payload = JSON.stringify({
  company: {
    places: [
      {
        id: "company-v3",
        name: "v3 회사",
        stops: [companyStop, secondCompanyStop],
        subwayStations: [subwayStation],
        selectedStopId: companyStop.id,
        routeOptions: [
          { id: "opt-a", startStopId: companyStop.id, transferStationId: null },
          {
            id: "opt-b",
            startStopId: secondCompanyStop.id,
            transferStationId: subwayStation.id,
          },
        ],
        activeRouteOptionId: "opt-b",
      },
    ],
    activePlaceId: "company-v3",
  },
  home: {
    places: [
      {
        id: "home-v3",
        name: "v3 집",
        stops: [],
        subwayStations: [],
        selectedStopId: null,
        routeOptions: [],
        activeRouteOptionId: null,
      },
    ],
    activePlaceId: "home-v3",
  },
});

const readySteps = [
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
] as const;

const readyProcedure = {
  id: "proc-ready",
  kind: "ready",
  name: "아침 출근",
  steps: readySteps,
};

const legacyDraft = {
  id: "draft-1",
  kind: "legacy-draft",
  stopId: secondCompanyStop.id,
  stationId: null,
};

const busFavorite = {
  id: "fav-bus-1",
  kind: "bus",
  stopId: companyStop.id,
  arsId: companyStop.arsId,
  routeId: "100100574",
  routeName: "341",
  direction: "강동공영차고지",
  accessMinutes: 6,
};

const subwayFavorite = {
  id: "fav-subway-1",
  kind: "subway",
  stationId: subwayStation.id,
  apiStationName: "천호(풍납토성)",
  subwayId: "1002",
  updnLine: "하행",
  lineName: "8호선",
  trainLineNm: "강남방면",
  accessMinutes: 8,
};

function v4Payload(placeOverrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    company: {
      places: [
        {
          id: "company-v4",
          name: "v4 회사",
          stops: [companyStop, secondCompanyStop],
          subwayStations: [subwayStation],
          selectedStopId: companyStop.id,
          routeOptions: [
            { id: "opt-a", startStopId: companyStop.id, transferStationId: null },
          ],
          activeRouteOptionId: "opt-a",
          procedures: [readyProcedure, legacyDraft],
          favorites: [busFavorite, subwayFavorite],
          activeProcedureId: "proc-ready",
          ...placeOverrides,
        },
      ],
      activePlaceId: "company-v4",
    },
    home: {
      places: [
        {
          id: "home-v4",
          name: "v4 집",
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
      activePlaceId: "home-v4",
    },
  });
}

class MemoryStorage {
  private readonly items = new Map<string, string>();

  getItem(key: string): string | null {
    return this.items.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.items.set(key, value);
  }
}

describe("commuteStopsStorage v4", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("loads v4 before v3, v2, and v1", () => {
    localStorage.setItem(V4_KEY, v4Payload());
    localStorage.setItem(V3_KEY, v3Payload);
    localStorage.setItem(V2_KEY, JSON.stringify({}));
    localStorage.setItem(V1_KEY, JSON.stringify({}));

    const loaded = loadCommutes();
    const companyPlace = loaded.company.places[0];

    expect(companyPlace?.name).toBe("v4 회사");
    expect(companyPlace?.procedures.map((procedure) => procedure.id)).toEqual([
      "proc-ready",
      "draft-1",
    ]);
  });

  it("migrates each v3 route option into a non-evaluable legacy draft and preserves places, points, and selections", () => {
    localStorage.setItem(V3_KEY, v3Payload);

    const loaded = loadCommutes();
    const companyPlace = loaded.company.places[0];

    expect(companyPlace).toMatchObject({
      id: "company-v3",
      name: "v3 회사",
      stops: [companyStop, secondCompanyStop],
      subwayStations: [subwayStation],
    });
    expect(loaded.company.activePlaceId).toBe("company-v3");
    expect(companyPlace?.procedures).toEqual([
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
    expect(companyPlace?.activeProcedureId).toBe("opt-b");
    expect(companyPlace?.favorites).toEqual([]);

    for (const procedure of companyPlace?.procedures ?? []) {
      expect(procedure.kind).toBe("legacy-draft");
      expect("steps" in procedure).toBe(false);
      expect(commuteProcedureSchema.safeParse(procedure).success).toBe(false);
    }
  });

  it("round trips ready procedures and favorites through v4 without touching v3", () => {
    localStorage.setItem(V4_KEY, v4Payload());
    localStorage.setItem(V3_KEY, v3Payload);

    const loaded = loadCommutes();
    saveCommutes(loaded);
    const reloaded = loadCommutes();
    const place = reloaded.company.places[0];
    const ready = place?.procedures.find(
      (procedure) => procedure.id === "proc-ready",
    );

    expect(ready?.kind).toBe("ready");
    if (ready?.kind === "ready") {
      expect(ready.steps.map((step) => step.kind)).toEqual([
        "walk",
        "bus",
        "walk",
        "subway",
        "walk",
      ]);
      expect(ready.name).toBe("아침 출근");
    }
    expect(place?.favorites).toEqual([busFavorite, subwayFavorite]);
    expect(place?.activeProcedureId).toBe("proc-ready");
    expect(loaded).toEqual(reloaded);
    expect(localStorage.getItem(V3_KEY)).toBe(v3Payload);
  });

  it("falls back to v3 when the v4 payload is corrupt or schema-invalid", () => {
    localStorage.setItem(V3_KEY, v3Payload);

    localStorage.setItem(V4_KEY, `{"company":`);
    expect(loadCommutes().company.places[0]?.name).toBe("v3 회사");

    const invalid = JSON.parse(v4Payload()) as {
      company: { places: Array<Record<string, unknown>> };
    };
    const firstPlace = invalid.company.places[0];
    if (!firstPlace) {
      throw new Error("Expected the first v4 place");
    }
    firstPlace.procedures = [
      {
        ...readyProcedure,
        steps: [
          { id: "s1", kind: "walk", minutes: 4 },
          { ...readySteps[1], rideMinutes: 0 },
        ],
      },
    ];
    localStorage.setItem(V4_KEY, JSON.stringify(invalid));
    const loaded = loadCommutes();
    expect(loaded.company.places[0]?.name).toBe("v3 회사");
    expect(
      loaded.company.places[0]?.procedures.every(
        (procedure) => procedure.kind === "legacy-draft",
      ),
    ).toBe(true);
  });

  it("preserves the old v1/v2/v3 keys byte-for-byte after migrating to v4", () => {
    const v2Payload = JSON.stringify({
      company: {
        places: [
          {
            id: "company-v2",
            name: "구버전 회사",
            stops: [companyStop],
            subwayStations: [],
            selectedStopId: companyStop.id,
          },
        ],
        activePlaceId: "company-v2",
      },
      home: { places: [], activePlaceId: null },
    });
    const v1Payload = JSON.stringify({ company: companyStop, home: null });
    localStorage.setItem(V3_KEY, v3Payload);
    localStorage.setItem(V2_KEY, v2Payload);
    localStorage.setItem(V1_KEY, v1Payload);

    saveCommutes(loadCommutes());

    expect(localStorage.getItem(V4_KEY)).not.toBeNull();
    expect(localStorage.getItem(V3_KEY)).toBe(v3Payload);
    expect(localStorage.getItem(V2_KEY)).toBe(v2Payload);
    expect(localStorage.getItem(V1_KEY)).toBe(v1Payload);
  });

  it("drops dangling procedures and favorites, dedupes identities, and falls back to a deterministic active procedure", () => {
    const danglingProcedure = {
      ...readyProcedure,
      id: "proc-dangling",
      steps: [
        { id: "s1", kind: "walk", minutes: 4 },
        {
          id: "s2",
          kind: "bus",
          stopId: "124099999",
          arsId: "99999",
          routeId: "100100574",
          routeName: "341",
          direction: "강동공영차고지",
          rideMinutes: 18,
          fallbackWaitMinutes: 7,
        },
      ],
    };
    const duplicateFavorite = { ...busFavorite, id: "fav-bus-2" };
    const danglingFavorite = { ...busFavorite, id: "fav-bus-3", stopId: "124088888" };
    localStorage.setItem(
      V4_KEY,
      v4Payload({
        procedures: [danglingProcedure, legacyDraft, readyProcedure],
        favorites: [
          busFavorite,
          duplicateFavorite,
          danglingFavorite,
          subwayFavorite,
        ],
        activeProcedureId: "proc-dangling",
      }),
    );

    const loaded = loadCommutes();
    const place = loaded.company.places[0];

    expect(place?.procedures.map((procedure) => procedure.id)).toEqual([
      "draft-1",
      "proc-ready",
    ]);
    expect(place?.favorites.map((favorite) => favorite.id)).toEqual([
      "fav-bus-1",
      "fav-subway-1",
    ]);
    expect(place?.activeProcedureId).toBe("draft-1");
  });

  it("loads and saves through an injected storage implementation without window.localStorage", () => {
    const store = new MemoryStorage();
    store.setItem(V3_KEY, v3Payload);

    const loaded = loadCommutes(store);
    expect(loaded.company.places[0]?.name).toBe("v3 회사");

    saveCommutes(loaded, store);
    expect(store.getItem(V4_KEY)).not.toBeNull();
    expect(JSON.parse(store.getItem(V4_KEY) ?? "{}").company.places[0].name).toBe(
      "v3 회사",
    );
    expect(localStorage.getItem(V4_KEY)).toBeNull();
    expect(localStorage.getItem(V3_KEY)).toBeNull();
  });
});
