// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { MapCanvas } from "./MapCanvas";

interface MapContainerProps {
  readonly children: ReactNode;
  readonly scrollWheelZoom?: boolean | "center";
  readonly touchZoom?: boolean | "center";
  readonly doubleClickZoom?: boolean | "center";
  readonly maxZoom?: number;
}

vi.mock("react-leaflet", () => ({
  MapContainer: ({
    children,
    scrollWheelZoom,
    touchZoom,
    doubleClickZoom,
    maxZoom,
  }: MapContainerProps) => (
    <div
      data-testid="leaflet-map"
      data-scroll-wheel-zoom={String(scrollWheelZoom)}
      data-touch-zoom={String(touchZoom)}
      data-double-click-zoom={String(doubleClickZoom)}
      data-max-zoom={String(maxZoom)}
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
