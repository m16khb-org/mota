import { describe, expect, it } from "vitest";
import type { TransitVehicle, TransitMapNetwork } from "@mota/contracts/transit-map";
import { prepareVehicleTransition } from "./trainInterpolation";

function train(
  id: string,
  coordinates: [number, number],
  capturedAt = "2026-09-05T04:00:10.000Z",
): TransitVehicle {
  return {
    id,
    mode: "subway",
    routeId: "1008",
    routeName: "8호선",
    coordinates,
    bearing: 90,
    direction: "상행",
    capturedAt,
    positionBasis: "station-segment",
  };
}

describe("prepareVehicleTransition", () => {
  it("keeps slightly off-track observations continuous without sideways jumps", () => {
    const vertical: TransitMapNetwork["subway"]["lines"] = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: { routeId: "8", routeName: "8호선", color: "#e6186c" },
          geometry: {
            type: "LineString",
            coordinates: [
              [127.1, 37.5],
              [127.1, 37.51],
            ],
          },
        },
      ],
    };
    const previous = train("a", [127.1002, 37.505], "2026-09-05T04:00:00.000Z");
    const next = train("a", [127.1003, 37.506]);
    const transition = prepareVehicleTransition([previous], [next], vertical);
    expect(transition(0.001)[0]?.coordinates[0]).toBeCloseTo(127.1002001, 8);
    expect(transition(0.999)[0]?.coordinates[0]).toBeCloseTo(127.1002999, 8);
    const farPrevious = { ...previous, coordinates: [127.103, 37.505] as [number, number] };
    const farNext = { ...next, coordinates: [127.1031, 37.505] as [number, number] };
    expect(
      prepareVehicleTransition([farPrevious], [farNext], vertical)(0.5)[0]?.coordinates,
    ).toEqual(farNext.coordinates);
  });
  const routes: TransitMapNetwork["subway"]["lines"] = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { routeId: "8", routeName: "8호선", color: "#e6186c" },
        geometry: {
          type: "LineString",
          coordinates: [
            [127.1, 37.5],
            [127.101, 37.5],
            [127.101, 37.501],
          ],
        },
      },
    ],
  };
  it("aligns an initially observed train with its track and preserves its heading while stopped", () => {
    const initial = { ...train("a", [127.1005, 37.5]), bearing: 0 };
    const placed = prepareVehicleTransition([], [initial], routes)(1)[0];
    expect(placed?.bearing).toBeCloseTo(90, 5);
    const prior = { ...initial, bearing: 270, capturedAt: "2026-09-05T04:00:00.000Z" };
    expect(prepareVehicleTransition([prior], [initial], routes)(1)[0]?.bearing).toBe(270);
  });
  it("follows a route corner instead of cutting across buildings and faces the travelled segment", () => {
    const previous = train("a", [127.1, 37.5], "2026-09-05T04:00:00.000Z");
    const next = train("a", [127.101, 37.501]);
    const forward = prepareVehicleTransition([previous], [next], routes)(0.6)[0];
    expect(forward?.coordinates[0]).toBeCloseTo(127.101, 7);
    expect(forward?.coordinates[1]).toBeGreaterThan(37.5);
    expect(forward?.bearing).toBeCloseTo(0, 4);
    const reverse = prepareVehicleTransition(
      [{ ...next, capturedAt: previous.capturedAt }],
      [{ ...previous, capturedAt: next.capturedAt }],
      routes,
    )(0.2)[0];
    expect(reverse?.bearing).toBeCloseTo(180, 4);
  });
  it("does not invent travel across missing, distant or unrelated route geometry", () => {
    const previous = train("a", [127.1, 37.5], "2026-09-05T04:00:00.000Z");
    const next = train("a", [127.2, 37.6]);
    expect(prepareVehicleTransition([previous], [next], routes)(0.5)).toEqual([next]);
    expect(
      prepareVehicleTransition([previous], [next], { type: "FeatureCollection", features: [] })(
        0.5,
      ),
    ).toEqual([next]);
  });
  it("returns previous, midpoint, and next coordinates across progress", () => {
    const previous = train("train-a", [127.1, 37.5], "2026-09-05T04:00:00.000Z");
    const next = train("train-a", [127.101, 37.5]);
    const transition = prepareVehicleTransition([previous], [next], routes);

    expect(transition(0)[0]?.coordinates).toEqual([127.1, 37.5]);
    expect(transition(0.5)[0]?.coordinates[0]).toBeCloseTo(127.1005, 8);
    expect(transition(1)).toEqual([next]);
    expect(transition(-2)[0]?.coordinates).toEqual(previous.coordinates);
    expect(transition(4)[0]?.coordinates).toEqual(next.coordinates);
  });

  it("clamps progress and uses the next snapshot when timestamps are equal", () => {
    const previous = train("train-a", [127.1, 37.5]);
    const next = train("train-a", [127.2, 37.6]);

    expect(prepareVehicleTransition([previous], [next], routes)(0.5)).toEqual([next]);
  });

  it("drops disappeared vehicles and shows newly observed vehicles", () => {
    const disappeared = train("gone", [127.1, 37.5]);
    const appeared = train("new", [127.2, 37.6]);

    expect(prepareVehicleTransition([disappeared], [appeared], routes)(0.5)).toEqual([appeared]);
    expect(prepareVehicleTransition([disappeared], [], routes)(0)).toEqual([]);
  });

  it("does not animate across a long observation gap", () => {
    const previous = train("train-a", [127.1, 37.5], "2026-09-05T04:00:00.000Z");
    const next = train("train-a", [127.101, 37.5], "2026-09-05T04:05:00.000Z");

    expect(prepareVehicleTransition([previous], [next], routes)(0.2)).toEqual([next]);
  });
});
