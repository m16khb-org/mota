import { describe, expect, it } from "vitest";
import { busStopSchema } from "../domain/bus";
import { loadTransitSelections, saveTransitSelections } from "./transitSelectionStorage";

const stop = busStopSchema.parse({
  id: "stop-1",
  arsId: "25014",
  name: "천호역",
  lat: 37.53,
  lng: 127.12,
  distanceMeters: 100,
});
const key = "mota:transit-selections:v1";
function storageWith(value: unknown) {
  const values = new Map([[key, JSON.stringify(value)]]);
  return {
    getItem: (name: string) => values.get(name) ?? null,
    setItem: (name: string, value: string) => {
      values.set(name, value);
    },
  };
}

describe("bus-only local selection compatibility", () => {
  it("keeps buses and commute-specific selections when obsolete subway fields are malformed", () => {
    const point = {
      busStops: [stop],
      subwayStations: { obsolete: true },
      selectedSubwayStationId: 123,
    };
    const storage = storageWith({
      commutes: {
        toWork: { ...point, selectedBusStopIds: [stop.id] },
        toHome: { ...point, selectedBusStopIds: [] },
      },
    });
    const selections = loadTransitSelections(storage);
    expect(selections.commutes.toWork).toEqual({ busStops: [stop], selectedBusStopIds: [stop.id] });
    expect(selections.commutes.toHome).toEqual({ busStops: [stop], selectedBusStopIds: [] });
    saveTransitSelections(selections, storage);
    expect(JSON.parse(storage.getItem(key) ?? "null")).toEqual(selections);
  });
  it("migrates singular selection in the same anonymous storage key", () => {
    const storage = storageWith({
      busStops: [stop],
      selectedBusStopId: stop.id,
      subwayStations: false,
    });
    const selections = loadTransitSelections(storage);
    expect(selections.commutes.toWork).toEqual({ busStops: [stop], selectedBusStopIds: [stop.id] });
    expect(selections.commutes.toHome).toEqual(selections.commutes.toWork);
  });
  it("rejects invalid bus data despite obsolete fields being ignored", () => {
    const storage = storageWith({
      busStops: [{ ...stop, arsId: "bad" }],
      selectedBusStopId: stop.id,
      subwayStations: [],
    });
    expect(loadTransitSelections(storage).commutes.toWork.busStops).toEqual([]);
  });
});
