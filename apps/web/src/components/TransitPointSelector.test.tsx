// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { busStopSchema } from "../domain/bus";
import { TransitPointSelector } from "./TransitPointSelector";

it("offers bus search, selection and independent deletion without retired controls", () => {
  const stop = busStopSchema.parse({
    id: "stop-1",
    arsId: "25014",
    name: "천호역",
    lat: 37.53,
    lng: 127.12,
    distanceMeters: 100,
  });
  const onAdd = vi.fn();
  const onSelectBusStop = vi.fn();
  const onRemoveBusStop = vi.fn();
  render(
    <TransitPointSelector
      busStops={[stop]}
      selectedBusStopIds={[stop.id]}
      searching={false}
      onAdd={onAdd}
      onSelectBusStop={onSelectBusStop}
      onRemoveBusStop={onRemoveBusStop}
    />,
  );
  expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
  expect(screen.queryByRole("link")).not.toBeInTheDocument();
  const selection = screen.getByRole("button", { name: "천호역 ARS 25014 지금 보는 곳" });
  expect(selection).toHaveAttribute("aria-pressed", "true");
  fireEvent.click(selection);
  fireEvent.click(screen.getByRole("button", { name: "천호역 정류장 삭제" }));
  fireEvent.click(screen.getByRole("button", { name: "정류장 찾기" }));
  expect(onSelectBusStop).toHaveBeenCalledWith(stop.id);
  expect(onRemoveBusStop).toHaveBeenCalledWith(stop.id);
  expect(onAdd).toHaveBeenCalledOnce();
});
