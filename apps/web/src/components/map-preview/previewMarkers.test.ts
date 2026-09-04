// @vitest-environment jsdom

import { fireEvent } from "@testing-library/react";
import { Map as MapLibreMap } from "maplibre-gl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { busStopSchema } from "../../domain/bus";
import { subwayStationSchema } from "../../domain/subway";
import { mapPreviewPoints, type MapPreviewPoint } from "./mapPreviewPoints";
import {
  installAnimationFrames,
  markerInstances,
  popupInstances,
  resetMapLibreRuntime,
} from "./mapLibreTestRuntime";
import { createPreviewMarkerPool } from "./previewMarkers";

vi.mock("maplibre-gl", async () => {
  const runtime = await import("./mapLibreTestRuntime");
  return {
    Map: runtime.MockMap,
    Marker: runtime.MockMarker,
    Popup: runtime.MockPopup,
  };
});

function bus(id: string, index: number) {
  return busStopSchema.parse({
    id,
    arsId: String(10000 + index),
    name: `버스 정류장 ${index}`,
    lat: 37.5 + index / 10000,
    lng: 127 + index / 10000,
    distanceMeters: index,
  });
}

function subway(id: string, index: number) {
  return subwayStationSchema.parse({
    id,
    name: `지하철역 ${index}`,
    line: `${(index % 9) + 1}호선`,
    lat: 37.6 + index / 10000,
    lng: 127.1 + index / 10000,
    distanceMeters: index + 100,
  });
}

function fixture(countBus = 1, countSubway = 1) {
  return mapPreviewPoints(
    Array.from({ length: countBus }, (_, index) => bus(String(index), index)),
    Array.from({ length: countSubway }, (_, index) => subway(String(index), index)),
  );
}

function setup(points: readonly MapPreviewPoint[] = fixture()) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const map = new MapLibreMap({ container });
  const onActivePointChange = vi.fn();
  const pool = createPreviewMarkerPool(map, onActivePointChange);
  pool.reconcile(points, null);
  return { container, map, onActivePointChange, points, pool };
}

function markerButton(container: HTMLElement, key: MapPreviewPoint["key"]) {
  const button = container.querySelector<HTMLButtonElement>(`button[data-point-key="${key}"]`);
  if (!button) throw new Error(`Missing marker button ${key}`);
  return button;
}

describe("createPreviewMarkerPool", () => {
  beforeEach(() => {
    document.body.replaceChildren();
    resetMapLibreRuntime();
    vi.unstubAllGlobals();
  });

  it("renders all 130 points as stable 44px native buttons with mode and order data", () => {
    const points = fixture(100, 30);
    const { container } = setup(points);
    const buttons = [...container.querySelectorAll<HTMLButtonElement>("button[data-point-key]")];

    expect(buttons).toHaveLength(130);
    expect(new Set(buttons.map((button) => button.dataset.pointKey)).size).toBe(130);
    expect(buttons[0]).toMatchObject({
      tagName: "BUTTON",
      type: "button",
    });
    expect(buttons[0]).toHaveAttribute("aria-label", "버스 버스 정류장 0");
    expect(buttons[0]).toHaveAttribute("aria-pressed", "false");
    expect(buttons[0]).toHaveAttribute("data-mode", "bus");
    expect(buttons[0]).toHaveAttribute("data-active", "false");
    expect(buttons[0]).toHaveClass("map-preview-marker--bus");
    expect(buttons[0]?.style.inlineSize).toBe("44px");
    expect(buttons[0]?.style.blockSize).toBe("44px");
    expect(buttons[0]?.style.zIndex).toBe("1");
    expect(buttons[100]).toHaveAttribute("data-mode", "subway");
    expect(buttons[100]).toHaveClass("map-preview-marker--subway");
    expect(buttons[129]?.style.zIndex).toBe("130");
  });

  it("keeps bus and subway points with the same raw ID and overlapping coordinates distinct", () => {
    const sharedBus = bus("same", 1);
    const sharedStation = subwayStationSchema.parse({
      ...subway("same", 1),
      lat: sharedBus.lat,
      lng: sharedBus.lng,
    });
    const points = mapPreviewPoints([sharedBus], [sharedStation]);
    const { container } = setup(points);

    expect(markerButton(container, "bus:same")).toHaveAttribute("data-mode", "bus");
    expect(markerButton(container, "subway:same")).toHaveAttribute("data-mode", "subway");
    expect(markerInstances.map((marker) => marker.coordinates)).toEqual([
      [sharedBus.lng, sharedBus.lat],
      [sharedBus.lng, sharedBus.lat],
    ]);
  });

  it("reuses unchanged markers, updates their deterministic order, and removes stale resources", () => {
    const original = fixture(2, 1);
    const { container, onActivePointChange, pool } = setup(original);
    const originalButtons = new Map(
      original.map((point) => [point.key, markerButton(container, point.key)]),
    );
    const originalMarkers = [...markerInstances];
    const originalPopups = [...popupInstances];

    const reordered = [original[2], original[0]].filter(
      (point): point is MapPreviewPoint => point !== undefined,
    );
    const [firstReordered, secondReordered] = reordered;
    if (!firstReordered || !secondReordered) {
      throw new Error("Missing reordered point fixtures");
    }
    pool.reconcile(reordered, null);

    expect(markerInstances).toHaveLength(3);
    expect(markerButton(container, firstReordered.key)).toBe(
      originalButtons.get(firstReordered.key),
    );
    expect(markerButton(container, secondReordered.key)).toBe(
      originalButtons.get(secondReordered.key),
    );
    expect(markerButton(container, firstReordered.key).style.zIndex).toBe("1");
    expect(markerButton(container, secondReordered.key).style.zIndex).toBe("2");
    expect(originalMarkers[1]?.remove).toHaveBeenCalledOnce();
    expect(originalPopups[1]?.remove).toHaveBeenCalled();
    expect(originalPopups[1]?.listenerCount()).toBe(0);
    onActivePointChange.mockClear();
    originalButtons.get(original[1]?.key ?? "bus:missing")?.click();
    expect(onActivePointChange).not.toHaveBeenCalled();

    pool.reconcile([], null);
    expect(container.querySelectorAll("button[data-point-key]")).toHaveLength(0);
    expect(originalMarkers.every((marker) => marker.removed)).toBe(true);
    expect(originalPopups.every((popup) => popup.listenerCount() === 0)).toBe(true);
  });

  it.each(["click", "Enter", " "] as const)(
    "activates once through %s and opens trusted text details",
    (input) => {
      const unsafe = bus("unsafe", 12);
      const point = mapPreviewPoints([{ ...unsafe, name: "<img src=x onerror=alert(1)>" }], [])[0];
      if (!point) throw new Error("Missing point fixture");
      const { container, onActivePointChange } = setup([point]);
      const button = markerButton(container, point.key);

      if (input === "click") {
        fireEvent.click(button);
      } else {
        const keydown = new KeyboardEvent("keydown", {
          key: input,
          repeat: false,
          bubbles: true,
          cancelable: true,
        });
        const shouldDispatchNativeClick = button.dispatchEvent(keydown);
        if (shouldDispatchNativeClick) button.click();
      }

      expect(onActivePointChange).toHaveBeenCalledOnce();
      expect(onActivePointChange).toHaveBeenCalledWith(point.key);
      expect(button).toHaveAttribute("aria-pressed", "true");
      const popup = container.querySelector(".maplibregl-popup");
      expect(popup?.textContent).toContain("<img src=x onerror=alert(1)>");
      expect(popup?.textContent).toContain("10012");
      expect(popup?.querySelector("img")).toBeNull();
    },
  );

  it("keeps marker clicks from becoming map clicks that close the new popup", () => {
    const { container, points } = setup();
    const point = points[0];
    if (!point) throw new Error("Missing point fixture");
    const mapClick = vi.fn();
    container.addEventListener("click", mapClick);

    fireEvent.click(markerButton(container, point.key));

    expect(container.querySelector(".maplibregl-popup")).not.toBeNull();
    expect(mapClick).not.toHaveBeenCalled();
  });

  it("removes the MapLibre marker opacity transition for reduced motion", () => {
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: true }));
    const { container, points } = setup();
    const point = points[0];
    if (!point) throw new Error("Missing point fixture");

    expect(markerButton(container, point.key).style.transitionDuration).toBe("1ms");
    vi.unstubAllGlobals();
  });

  it("opens the same details when an external list supplies the active key", () => {
    const points = fixture(1, 1);
    const { container, onActivePointChange, pool } = setup(points);
    const station = points[1];
    if (!station) throw new Error("Missing station fixture");

    pool.reconcile(points, station.key);

    expect(onActivePointChange).not.toHaveBeenCalled();
    expect(markerButton(container, station.key)).toHaveAttribute("aria-pressed", "true");
    const popup = container.querySelector(".maplibregl-popup");
    expect(popup?.textContent).toContain(station.name);
    expect(popup?.textContent).toContain(station.detail);
  });

  it("closes on Escape and restores focus only when focus was inside popup content", () => {
    const frames = installAnimationFrames();
    const { container, onActivePointChange, points } = setup();
    const point = points[0];
    if (!point) throw new Error("Missing point fixture");
    const button = markerButton(container, point.key);
    fireEvent.click(button);
    const popupClose = container.querySelector<HTMLButtonElement>(".maplibregl-popup-close-button");
    if (!popupClose) throw new Error("Missing popup close button");
    expect(document.activeElement).toBe(popupClose);
    onActivePointChange.mockClear();

    fireEvent.keyDown(popupClose, { key: "Escape" });
    expect(container.querySelector(".maplibregl-popup")).toBeNull();
    expect(onActivePointChange).toHaveBeenCalledOnce();
    expect(onActivePointChange).toHaveBeenCalledWith(null);
    expect(frames.pending()).toBe(1);
    frames.flush();
    expect(document.activeElement).toBe(button);

    fireEvent.click(button);
    const otherPoint = points[1];
    if (!otherPoint) throw new Error("Missing comparison point fixture");
    const otherButton = markerButton(container, otherPoint.key);
    otherButton.focus();
    onActivePointChange.mockClear();
    fireEvent.keyDown(otherButton, { key: "Escape" });
    frames.flush();
    expect(document.activeElement).toBe(otherButton);
    expect(onActivePointChange).toHaveBeenCalledWith(null);
  });

  it("drops a disappearing focused marker without restoring focus to its detached button", () => {
    const frames = installAnimationFrames();
    const { container, onActivePointChange, points, pool } = setup();
    const point = points[0];
    if (!point) throw new Error("Missing point fixture");
    const button = markerButton(container, point.key);
    fireEvent.click(button);
    expect(container.querySelector(".maplibregl-popup-close-button")).toBe(document.activeElement);
    onActivePointChange.mockClear();

    pool.reconcile([], point.key);
    frames.flush();

    expect(button.isConnected).toBe(false);
    expect(document.activeElement).not.toBe(button);
    expect(onActivePointChange).toHaveBeenCalledOnce();
    expect(onActivePointChange).toHaveBeenCalledWith(null);
  });

  it("destroys every marker, popup listener, and container listener idempotently", () => {
    const { container, pool } = setup(fixture(3, 2));
    const removeEventListener = vi.spyOn(container, "removeEventListener");

    pool.destroy();
    pool.destroy();

    expect(markerInstances.every((marker) => marker.removed)).toBe(true);
    expect(popupInstances.every((popup) => popup.listenerCount() === 0)).toBe(true);
    expect(removeEventListener).toHaveBeenCalledWith("keydown", expect.any(Function));
    expect(removeEventListener).toHaveBeenCalledWith("click", expect.any(Function), true);
  });
});
