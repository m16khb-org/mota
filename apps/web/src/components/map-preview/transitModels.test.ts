import { describe, expect, it } from "vitest";
import type { TransitVehicle } from "@mota/contracts/transit-map";
import { vehicleModels } from "./transitModels";

const bus: TransitVehicle = {
  id: "bus",
  mode: "bus",
  routeId: "341",
  routeName: "341",
  coordinates: [127.124, 37.536],
  bearing: 0,
  direction: "강남",
  capturedAt: "2026-09-05T04:00:00.000Z",
  positionBasis: "gps",
};

describe("transit model geometry", () => {
  it("keeps the body centered on GPS and rotates its long axis clockwise from north", () => {
    for (const heading of [0, 90]) {
      const body = vehicleModels([{ ...bus, bearing: heading }]).features.find(
        (part) => part.properties.part === "body",
      );
      const ring = body?.geometry.coordinates[0];
      if (!ring) throw new Error("Missing body geometry");
      const corners = ring.slice(0, 4);
      expect(corners.reduce((sum, p) => sum + p[0], 0) / 4).toBeCloseTo(127.124, 9);
      expect(corners.reduce((sum, p) => sum + p[1], 0) / 4).toBeCloseTo(37.536, 9);
      const width =
        (Math.max(...corners.map((p) => p[0])) - Math.min(...corners.map((p) => p[0]))) *
        111195 *
        Math.cos((37.536 * Math.PI) / 180);
      const length =
        (Math.max(...corners.map((p) => p[1])) - Math.min(...corners.map((p) => p[1]))) * 111195;
      expect(width).toBeCloseTo(heading === 0 ? 4 : 14, 5);
      expect(length).toBeCloseTo(heading === 0 ? 14 : 4, 5);
      expect(ring[0]).toEqual(ring[4]);
    }
  });
  it("replaces all parts when a vehicle disappears", () => {
    expect(vehicleModels([bus]).features.length).toBeGreaterThan(2);
    expect(vehicleModels([]).features).toEqual([]);
  });
});
