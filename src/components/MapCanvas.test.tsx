// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MapCanvas } from "./MapCanvas";

interface MapContainerProps {
  readonly children: ReactNode;
  readonly maxBounds?: unknown;
  readonly maxBoundsViscosity?: number;
  readonly inertia?: boolean;
  readonly inertiaMaxSpeed?: number;
  readonly scrollWheelZoom?: boolean | "center";
  readonly touchZoom?: boolean | "center";
  readonly doubleClickZoom?: boolean | "center";
  readonly maxZoom?: number;
  readonly zoomAnimation?: boolean;
  readonly fadeAnimation?: boolean;
  readonly markerZoomAnimation?: boolean;
}

let reducedMotion = false;

const mockMap = {
  getCenter: () => ({ lat: 37.5366, lng: 127.1253 }),
  getZoom: () => 15,
  setView: vi.fn(),
  getContainer: () => document.createElement("div"),
  invalidateSize: vi.fn(),
  options: {
    zoomAnimation: true,
    fadeAnimation: true,
    markerZoomAnimation: true,
  },
};

vi.mock("react-leaflet", () => ({
  MapContainer: ({
    children,
    scrollWheelZoom,
    touchZoom,
    doubleClickZoom,
    maxZoom,
    zoomAnimation,
    fadeAnimation,
    markerZoomAnimation,
    maxBounds,
    maxBoundsViscosity,
    inertia,
    inertiaMaxSpeed,
  }: MapContainerProps) => (
    <div
      data-testid="leaflet-map"
      data-scroll-wheel-zoom={String(scrollWheelZoom)}
      data-touch-zoom={String(touchZoom)}
      data-double-click-zoom={String(doubleClickZoom)}
      data-max-zoom={String(maxZoom)}
      data-zoom-animation={String(zoomAnimation)}
      data-fade-animation={String(fadeAnimation)}
      data-marker-zoom-animation={String(markerZoomAnimation)}
      data-max-bounds={maxBounds ? JSON.stringify(maxBounds) : "undefined"}
      data-max-bounds-viscosity={String(maxBoundsViscosity)}
      data-inertia={String(inertia)}
      data-inertia-max-speed={String(inertiaMaxSpeed)}
    >
      {children}
    </div>
  ),
  TileLayer: ({ maxZoom }: { readonly maxZoom?: number }) => (
    <span data-testid="leaflet-tiles" data-max-zoom={String(maxZoom)} />
  ),
  CircleMarker: ({ children }: { readonly children: ReactNode }) => children,
  Popup: ({ children }: { readonly children: ReactNode }) => children,
  useMap: () => mockMap,
  useMapEvents: vi.fn(),
}));

describe("MapCanvas", () => {
  it("keeps every zoom gesture anchored to the map center", () => {
    render(
      <MapCanvas
        center={{ lat: 37.5366, lng: 127.1253 }}
        stops={[]}
        selectedStop={null}
        onCenterChange={vi.fn()}
        onSelect={vi.fn()}
      />,
    );

    const map = screen.getByTestId("leaflet-map");
    expect(map).toHaveAttribute("data-scroll-wheel-zoom", "center");
    expect(map).toHaveAttribute("data-touch-zoom", "center");
    expect(map).toHaveAttribute("data-double-click-zoom", "center");
  });

  it("stops zooming at the final supported tile level", () => {
    render(
      <MapCanvas
        center={{ lat: 37.5366, lng: 127.1253 }}
        stops={[]}
        selectedStop={null}
        onCenterChange={vi.fn()}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByTestId("leaflet-map")).toHaveAttribute(
      "data-max-zoom",
      "19",
    );
    expect(screen.getByTestId("leaflet-tiles")).toHaveAttribute(
      "data-max-zoom",
      "19",
    );
  });
});

describe("MapCanvas popup Escape focus restore", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  function setupOpenPopup() {
    render(
      <MapCanvas
        center={{ lat: 37.5366, lng: 127.1253 }}
        stops={[]}
        selectedStop={null}
        onCenterChange={vi.fn()}
        onSelect={vi.fn()}
      />,
    );
    const frame = document.querySelector(".picker-map-frame");
    expect(frame).not.toBeNull();
    // Simulate Leaflet's popup DOM inside the frame.
    const popupPane = document.createElement("div");
    const popup = document.createElement("div");
    popup.className = "leaflet-popup";
    const closeButton = document.createElement("a");
    closeButton.className = "leaflet-popup-close-button";
    popup.appendChild(closeButton);
    popupPane.appendChild(popup);
    frame?.appendChild(popupPane);
    // Simulate a focusable owner marker element.
    const marker = document.createElement("div");
    marker.tabIndex = 0;
    frame?.appendChild(marker);
    return { frame, popup, closeButton, marker };
  }

  it("restores focus to the owner marker when Escape fires with focus inside the popup", () => {
    const { frame, popup, marker } = setupOpenPopup();
    // Announce the popup source via the bubbling CustomEvent from CenterObserver.
    frame?.dispatchEvent(
      new CustomEvent("popupopen", {
        bubbles: true,
        detail: { popup: { _source: { getElement: () => marker } } },
      }),
    );
    const focusTarget = document.createElement("button");
    popup.appendChild(focusTarget);
    focusTarget.focus();

    const clickSpy = vi.fn();
    const closeAnchor = frame?.querySelector(
      ".leaflet-popup-close-button",
    ) as HTMLAnchorElement;
    closeAnchor.addEventListener("click", clickSpy);

    frame?.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );

    expect(clickSpy).toHaveBeenCalledTimes(1);
    // rAF is async; wait a microtask for the refocus.
    return new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        expect(document.activeElement).toBe(marker);
        resolve();
      });
    });
  });

  it("does not move focus when Escape fires with focus outside the popup", () => {
    const { frame, marker } = setupOpenPopup();
    frame?.dispatchEvent(
      new CustomEvent("popupopen", {
        bubbles: true,
        detail: { popup: { _source: { getElement: () => marker } } },
      }),
    );
    // Focus the marker (outside the popup), not popup content.
    marker.focus();

    const clickSpy = vi.fn();
    const closeAnchor = frame?.querySelector(
      ".leaflet-popup-close-button",
    ) as HTMLAnchorElement;
    closeAnchor.addEventListener("click", clickSpy);

    frame?.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );

    expect(clickSpy).toHaveBeenCalledTimes(1);
    return new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        expect(document.activeElement).toBe(marker);
        resolve();
      });
    });
  });
});

describe("MapCanvas motion and hit targets", () => {
  afterEach(() => {
    reducedMotion = false;
  });

  it("runs Leaflet zoom/fade/marker animations under normal motion", () => {
    render(
      <MapCanvas
        center={{ lat: 37.5366, lng: 127.1253 }}
        stops={[]}
        selectedStop={null}
        onCenterChange={vi.fn()}
        onSelect={vi.fn()}
      />,
    );

    const map = screen.getByTestId("leaflet-map");
    expect(map).toHaveAttribute("data-zoom-animation", "true");
    expect(map).toHaveAttribute("data-fade-animation", "true");
    expect(map).toHaveAttribute("data-marker-zoom-animation", "true");
  });

  it("disables every Leaflet animation under prefers-reduced-motion", () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockImplementation((query: string) => ({
        matches: reducedMotion && query === "(prefers-reduced-motion: reduce)",
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      })),
    );
    reducedMotion = true;

    render(
      <MapCanvas
        center={{ lat: 37.5366, lng: 127.1253 }}
        stops={[]}
        selectedStop={null}
        onCenterChange={vi.fn()}
        onSelect={vi.fn()}
      />,
    );

    const map = screen.getByTestId("leaflet-map");
    expect(map).toHaveAttribute("data-zoom-animation", "false");
    expect(map).toHaveAttribute("data-fade-animation", "false");
    expect(map).toHaveAttribute("data-marker-zoom-animation", "false");
    vi.unstubAllGlobals();
  });
});

describe("MapCanvas visible marker styling contract", () => {
  it("styles visible markers by token class without the leaflet-interactive gate", async () => {
    // The visible circles are intentionally non-interactive (interaction lives
    // on the 44px hit circle), so Leaflet never adds .leaflet-interactive to
    // them. Gating the token rules on that class leaves markers Leaflet-blue.
    const { readFile } = await import("node:fs/promises");
    const { resolve } = await import("node:path");
    const css = await readFile(resolve(process.cwd(), "src/styles.css"), "utf8");

    expect(css).not.toContain(".leaflet-interactive.map-marker");
    const ruleOf = (selector: string, stroke: string, fill: string) =>
      new RegExp(
        `^${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} \\{\\n  stroke: var\\(${stroke}\\);\\n  fill: var\\(${fill}\\);\\n\\}$`,
        "m",
      );
    expect(css).toMatch(ruleOf(".map-marker-bus", "--route-blue", "--surface"));
    expect(css).toMatch(ruleOf(".map-marker-subway", "--subway", "--surface"));
    expect(css).toMatch(ruleOf(".map-marker-pending", "--route-blue", "--surface"));
    expect(css).toMatch(ruleOf(".map-marker-bus.is-active", "--ink", "--signal"));
    expect(css).toContain(
      ".map-marker-subway.is-active {\n  stroke: var(--subway);\n  stroke-width: 4px;\n  fill: var(--signal);\n}",
    );
    // Focus stays on the interactive hit circle only.
    expect(css).toMatch(/^\.leaflet-interactive:focus-visible \{/m);
  });
});

describe("MapCanvas container resize", () => {
  it("repaints the Leaflet map when its container resizes", () => {
    const resizeCallbacks: ResizeObserverCallback[] = [];
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(callback: ResizeObserverCallback) {
          resizeCallbacks.push(callback);
        }
        observe = vi.fn();
        unobserve = vi.fn();
        disconnect = vi.fn();
      },
    );

    render(
      <MapCanvas
        center={{ lat: 37.5366, lng: 127.1253 }}
        stops={[]}
        selectedStop={null}
        onCenterChange={vi.fn()}
        onSelect={vi.fn()}
      />,
    );

    expect(resizeCallbacks).toHaveLength(1);
    const notifyResize = resizeCallbacks[0];
    if (notifyResize === undefined) {
      throw new Error("ResizeObserver was not registered");
    }
    notifyResize([], {} as ResizeObserver);
    expect(mockMap.invalidateSize).toHaveBeenCalledWith({ animate: false });

    vi.unstubAllGlobals();
  });
});

describe("MapCanvas drag containment", () => {
  it("clamps the view to the Seoul service area and caps drag inertia", () => {
    render(
      <MapCanvas
        center={{ lat: 37.5366, lng: 127.1253 }}
        stops={[]}
        selectedStop={null}
        onCenterChange={vi.fn()}
        onSelect={vi.fn()}
      />,
    );
    const map = screen.getByTestId("leaflet-map");
    expect(map).toHaveAttribute(
      "data-max-bounds",
      JSON.stringify([
        [37.2, 126.6],
        [37.95, 127.45],
      ]),
    );
    expect(map).toHaveAttribute("data-max-bounds-viscosity", "1");
    expect(map).toHaveAttribute("data-inertia", "true");
    expect(map).toHaveAttribute("data-inertia-max-speed", "2");
  });
});
