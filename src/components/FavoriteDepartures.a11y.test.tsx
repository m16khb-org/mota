// @vitest-environment jsdom

import type { ComponentProps } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { busCommuteFavoriteSchema } from "../domain/commute";
import type { LiveSnapshot } from "../domain/liveCommuteQueries";
import { FavoriteDepartures } from "./FavoriteDepartures";

const favorite = busCommuteFavoriteSchema.parse({
  id: "fav-bus",
  kind: "bus",
  stopId: "124000454",
  arsId: "25014",
  routeId: "100100574",
  routeName: "341",
  direction: "강동공영차고지",
  accessMinutes: 5,
});
const props = {
  favorites: [favorite],
  snapshots: new Map<string, LiveSnapshot>(),
  now: 0,
  onUpdateFavorite: vi.fn(),
  onUnpinFavorite: vi.fn(),
} satisfies ComponentProps<typeof FavoriteDepartures>;

describe("FavoriteDepartures accessibility", () => {
  it("resolves each repeated region to its own heading", () => {
    // Given: two independently mounted favorite boards.
    render(
      <>
        <FavoriteDepartures {...props} />
        <FavoriteDepartures {...props} />
      </>,
    );

    // When: assistive technology follows each region's ID reference.
    const regions = screen.getAllByRole("region");

    // Then: every region resolves to its local heading instead of the first board's heading.
    expect(regions).toHaveLength(2);
    for (const region of regions) {
      expect(document.getElementById(region.getAttribute("aria-labelledby") ?? "")).toBe(
        region.querySelector("h2"),
      );
    }
  });
});
