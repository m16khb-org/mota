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
}

vi.mock("react-leaflet", () => ({
  MapContainer: ({
    children,
    scrollWheelZoom,
    touchZoom,
    doubleClickZoom,
  }: MapContainerProps) => (
    <div
      data-testid="leaflet-map"
      data-scroll-wheel-zoom={String(scrollWheelZoom)}
      data-touch-zoom={String(touchZoom)}
      data-double-click-zoom={String(doubleClickZoom)}
    >
      {children}
    </div>
  ),
  TileLayer: () => null,
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
});
