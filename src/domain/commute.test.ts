import { describe, expect, it } from "vitest";
import {
  commuteFavoriteSchema,
  commuteProcedureSchema,
  savedCommuteProcedureSchema,
} from "./commute";

const walkStep = (id: string, minutes = 5) => ({
  id,
  kind: "walk",
  minutes,
});

const busStep = {
  id: "step-bus",
  kind: "bus",
  stopId: "124000454",
  arsId: "25014",
  routeId: "100100574",
  routeName: "341",
  direction: "강동공영차고지",
  rideMinutes: 18,
  fallbackWaitMinutes: 7,
};

const subwayStep = {
  id: "step-subway",
  kind: "subway",
  stationId: "osm-node-2095165702",
  apiStationName: "천호(풍납토성)",
  subwayId: "1002",
  updnLine: "하행",
  lineName: "2호선",
  trainLineNm: "강남방면",
  rideMinutes: 22,
  fallbackWaitMinutes: 6,
};

const completeProcedure = {
  id: "proc-1",
  kind: "ready",
  name: "아침 출근",
  steps: [
    walkStep("step-walk-1"),
    busStep,
    walkStep("step-walk-2", 3),
    subwayStep,
    walkStep("step-walk-3", 4),
  ],
};

describe("saved commute procedures", () => {
  it("parses the complete walk-bus-walk-subway-walk fixture as a ready procedure", () => {
    const result = savedCommuteProcedureSchema.safeParse(completeProcedure);

    if (!result.success || result.data.kind !== "ready") {
      throw new Error("expected the complete fixture to parse as ready");
    }
    expect(result.data.kind).toBe("ready");
    expect(result.data.steps.map((step) => step.kind)).toEqual([
      "walk",
      "bus",
      "walk",
      "subway",
      "walk",
    ]);
  });

  it("keeps display labels stored separately from identity keys", () => {
    const result = commuteProcedureSchema.parse(completeProcedure);
    const bus = result.steps[1];
    const subway = result.steps[3];

    if (bus?.kind !== "bus" || subway?.kind !== "subway") {
      throw new Error("expected bus and subway steps in order");
    }
    expect(bus.routeName).toBe("341");
    expect(bus.direction).toBe("강동공영차고지");
    expect(bus.routeId).not.toBe(bus.routeName);
    expect(subway.lineName).toBe("2호선");
    expect(subway.trainLineNm).toBe("강남방면");
    expect(subway.subwayId).not.toBe(subway.lineName);
    expect(subway.updnLine).not.toBe(subway.trainLineNm);
  });

  it("rejects duplicate step ids", () => {
    const result = savedCommuteProcedureSchema.safeParse({
      ...completeProcedure,
      steps: [walkStep("step-walk-1"), { ...busStep, id: "step-walk-1" }],
    });

    expect(result.success).toBe(false);
  });

  it("rejects a procedure with no steps", () => {
    const result = savedCommuteProcedureSchema.safeParse({
      ...completeProcedure,
      steps: [],
    });

    expect(result.success).toBe(false);
  });

  it("rejects a ready procedure without a name or with an unknown step kind", () => {
    expect(
      savedCommuteProcedureSchema.safeParse({
        ...completeProcedure,
        name: "",
      }).success,
    ).toBe(false);
    expect(
      savedCommuteProcedureSchema.safeParse({
        ...completeProcedure,
        steps: [
          walkStep("step-walk-1"),
          { id: "step-x", kind: "taxi", minutes: 5 },
        ],
      }).success,
    ).toBe(false);
  });
});

describe("bus step identity", () => {
  it("rejects missing exact bus identity fields", () => {
    const omit = (key: string) => {
      const step = { ...busStep } as Record<string, unknown>;
      delete step[key];
      return savedCommuteProcedureSchema.safeParse({
        ...completeProcedure,
        steps: [step],
      });
    };

    for (const key of ["stopId", "arsId", "routeId", "direction"]) {
      expect(omit(key).success).toBe(false);
    }
    expect(
      savedCommuteProcedureSchema.safeParse({
        ...completeProcedure,
        steps: [{ ...busStep, direction: "" }],
      }).success,
    ).toBe(false);
  });

  it("rejects a blank arsId instead of fabricating 00000", () => {
    const result = savedCommuteProcedureSchema.safeParse({
      ...completeProcedure,
      steps: [walkStep("step-walk-1"), { ...busStep, arsId: "" }],
    });

    expect(result.success).toBe(false);
  });

  it("rejects numeric arsId and numeric stopId instead of coercing them", () => {
    expect(
      savedCommuteProcedureSchema.safeParse({
        ...completeProcedure,
        steps: [walkStep("step-walk-1"), { ...busStep, arsId: 25014 }],
      }).success,
    ).toBe(false);
    expect(
      savedCommuteProcedureSchema.safeParse({
        ...completeProcedure,
        steps: [walkStep("step-walk-1"), { ...busStep, stopId: 124000454 }],
      }).success,
    ).toBe(false);
    expect(
      commuteFavoriteSchema.safeParse({
        id: "fav-bus-1",
        kind: "bus",
        stopId: 124000454,
        arsId: 25014,
        routeId: "100100574",
        routeName: "341",
        direction: "강동공영차고지",
        accessMinutes: 6,
      }).success,
    ).toBe(false);
    expect(
      commuteFavoriteSchema.safeParse({
        id: "fav-bus-1",
        kind: "bus",
        stopId: "124000454",
        arsId: "",
        routeId: "100100574",
        routeName: "341",
        direction: "강동공영차고지",
        accessMinutes: 6,
      }).success,
    ).toBe(false);
  });
});

describe("subway step identity", () => {
  it("rejects missing exact subway identity fields", () => {
    const omit = (key: string) => {
      const step = { ...subwayStep } as Record<string, unknown>;
      delete step[key];
      return savedCommuteProcedureSchema.safeParse({
        ...completeProcedure,
        steps: [step],
      });
    };

    for (const key of [
      "stationId",
      "apiStationName",
      "subwayId",
      "updnLine",
    ]) {
      expect(omit(key).success).toBe(false);
    }
    expect(
      savedCommuteProcedureSchema.safeParse({
        ...completeProcedure,
        steps: [{ ...subwayStep, subwayId: "" }],
      }).success,
    ).toBe(false);
  });
});

describe("saved minutes", () => {
  it("rejects negative, zero, non-integer, and string minutes", () => {
    const withWalkMinutes = (minutes: unknown) =>
      savedCommuteProcedureSchema.safeParse({
        ...completeProcedure,
        steps: [walkStep("step-walk-1", minutes as number)],
      });

    expect(withWalkMinutes(-3).success).toBe(false);
    expect(withWalkMinutes(0).success).toBe(false);
    expect(withWalkMinutes(2.5).success).toBe(false);
    expect(withWalkMinutes("5").success).toBe(false);
    expect(
      savedCommuteProcedureSchema.safeParse({
        ...completeProcedure,
        steps: [{ ...busStep, rideMinutes: 18.5 }],
      }).success,
    ).toBe(false);
    expect(
      savedCommuteProcedureSchema.safeParse({
        ...completeProcedure,
        steps: [{ ...subwayStep, fallbackWaitMinutes: -1 }],
      }).success,
    ).toBe(false);
  });
});

describe("favorite services", () => {
  const busFavorite = {
    id: "fav-bus-1",
    kind: "bus",
    stopId: "124000454",
    arsId: "25014",
    routeId: "100100574",
    routeName: "341",
    direction: "강동공영차고지",
    accessMinutes: 6,
  };
  const subwayFavorite = {
    id: "fav-subway-1",
    kind: "subway",
    stationId: "osm-node-2095165702",
    apiStationName: "천호(풍납토성)",
    subwayId: "1002",
    updnLine: "하행",
    lineName: "2호선",
    trainLineNm: "강남방면",
    accessMinutes: 8,
  };

  it("parses direction-specific bus favorites with the same display route", () => {
    const outbound = commuteFavoriteSchema.parse({
      ...busFavorite,
      direction: "강동공영차고지",
    });
    const inbound = commuteFavoriteSchema.parse({
      ...busFavorite,
      id: "fav-bus-2",
      direction: "천호역",
    });

    if (outbound.kind !== "bus" || inbound.kind !== "bus") {
      throw new Error("expected bus favorites");
    }
    expect(outbound.routeName).toBe(inbound.routeName);
    expect(outbound.direction).not.toBe(inbound.direction);
  });

  it("distinguishes the same display line with a different updnLine", () => {
    const down = commuteFavoriteSchema.parse(subwayFavorite);
    const up = commuteFavoriteSchema.parse({
      ...subwayFavorite,
      id: "fav-subway-2",
      updnLine: "상행",
    });

    if (down.kind !== "subway" || up.kind !== "subway") {
      throw new Error("expected subway favorites");
    }
    expect(down.lineName).toBe(up.lineName);
    expect(down.updnLine).not.toBe(up.updnLine);
  });

  it("distinguishes the same display direction with a different subwayId", () => {
    const line2 = commuteFavoriteSchema.parse(subwayFavorite);
    const line8 = commuteFavoriteSchema.parse({
      ...subwayFavorite,
      id: "fav-subway-3",
      subwayId: "1008",
      lineName: "8호선",
    });

    if (line2.kind !== "subway" || line8.kind !== "subway") {
      throw new Error("expected subway favorites");
    }
    expect(line2.trainLineNm).toBe(line8.trainLineNm);
    expect(line2.subwayId).not.toBe(line8.subwayId);
  });

  it("rejects favorites without access minutes or with blank identity", () => {
    const noAccess = { ...subwayFavorite } as Record<string, unknown>;
    delete noAccess.accessMinutes;
    expect(commuteFavoriteSchema.safeParse(noAccess).success).toBe(false);
    expect(
      commuteFavoriteSchema.safeParse({ ...busFavorite, direction: "" })
        .success,
    ).toBe(false);
  });
});

describe("computed and live fields", () => {
  it("rejects instead of strips computed ETA fields on a ready procedure", () => {
    expect(
      savedCommuteProcedureSchema.safeParse({
        ...completeProcedure,
        arrivalAt: "2026-08-20T21:00:00.000Z",
        etaMinutes: 65,
        leaveBy: "2026-08-20T20:10:00.000Z",
      }).success,
    ).toBe(false);
  });

  it("rejects live snapshot fields on transit steps", () => {
    expect(
      savedCommuteProcedureSchema.safeParse({
        ...completeProcedure,
        steps: [
          walkStep("step-walk-1"),
          {
            ...busStep,
            nextArrivalSeconds: 240,
            snapshotAt: "2026-08-20T12:00:00.000Z",
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      savedCommuteProcedureSchema.safeParse({
        ...completeProcedure,
        steps: [walkStep("step-walk-1"), { ...subwayStep, seconds: 120 }],
      }).success,
    ).toBe(false);
  });

  it("rejects live countdown fields on favorites", () => {
    expect(
      commuteFavoriteSchema.safeParse({
        id: "fav-bus-1",
        kind: "bus",
        stopId: "124000454",
        arsId: "25014",
        routeId: "100100574",
        routeName: "341",
        direction: "강동공영차고지",
        accessMinutes: 6,
        nextArrivalSeconds: 240,
      }).success,
    ).toBe(false);
  });
});
