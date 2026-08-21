// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MapCanvas } from "./MapCanvas";

interface MapContainerProps {
  readonly children: ReactNode;
  readonly scrollWheelZoom?: boolean | "center";
  readonly touchZoom?: boolean | "center";
  readonly doubleClickZoom?: boolean | "center";
  readonly maxZoom?: number;
  readonly zoomAnimation?: boolean;
  readonly fadeAnimation?: boolean;
  readonly markerZoomAnimation?: boolean;
}

let reducedMotion = false;

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
    >
      {children}
    </div>
  ),
  TileLayer: ({ maxZoom }: { readonly maxZoom?: number }) => (
    <span data-testid="leaflet-tiles" data-max-zoom={String(maxZoom)} />
  ),
  CircleMarker: ({ children }: { readonly children: ReactNode }) => children,
  Popup: ({ children }: { readonly children: ReactNode }) => children,
  useMap: () => ({
    getCenter: () => ({ lat: 37.5366, lng: 127.1253 }),
    getZoom: () => 15,
    setView: vi.fn(),
    getContainer: () => document.createElement("div"),
    options: {
      zoomAnimation: true,
      fadeAnimation: true,
      markerZoomAnimation: true,
    },
  }),
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
    expect(
      css.includes(
        ".map-marker-bus.is-active,\n.map-marker-subway.is-active {\n  stroke: var(--ink);\n  fill: var(--signal);\n}",
      ),
    ).toBe(true);
    // Focus stays on the interactive hit circle only.
    expect(css).toMatch(/^\.leaflet-interactive:focus-visible \{/m);
  });
});
