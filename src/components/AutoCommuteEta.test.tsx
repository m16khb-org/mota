/** @vitest-environment jsdom */

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { autoCommuteProcedureSchema } from "../domain/commute";
import { deriveAutoCommutePlan } from "../domain/autoCommuteEstimate";
import type { ResolvedAutoPoint } from "../domain/autoCommuteEstimate";
import { AutoCommuteEta } from "./AutoCommuteEta";

const stopA: ResolvedAutoPoint = {
  pointId: "stop-a",
  kind: "stop",
  name: "집앞 정류장",
  lat: 37.52,
  lng: 127.1,
  arsId: "25015" as never,
};

const stationB: ResolvedAutoPoint = {
  pointId: "station-b",
  kind: "station",
  name: "천호",
  lat: 37.51,
  lng: 127.1005,
};

describe("AutoCommuteEta NaN timestamps", () => {
  it("degrades invalid leg timestamps to a label instead of throwing", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const nanProcedure = autoCommuteProcedureSchema.parse({
      id: "proc-nan",
      kind: "auto",
      name: "이상 시간",
      points: [
        { type: "stop", stopId: "stop-a", arsId: "25015" },
        { type: "station", stationId: "station-b", apiStationName: "천호" },
      ],
    });
    // NaN now poisons every derived timestamp through the plan.
    const nanPlan = deriveAutoCommutePlan({
      procedure: nanProcedure,
      points: [stopA, stationB],
      origin: null,
      now: Number.NaN,
    });
    expect(() =>
      render(
        <AutoCommuteEta
          procedure={nanProcedure}
          plan={nanPlan}
          refreshing={false}
          onEditProcedure={() => {}}
          onRefresh={() => {}}
          onSetOrigin={() => {}}
        />,
      ),
    ).not.toThrow();
    expect(screen.getAllByText(/시간 미확인/).length).toBeGreaterThan(0);
    vi.mocked(console.error).mockRestore();
  });
});
