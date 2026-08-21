// @vitest-environment jsdom

import type { ComponentProps } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { busCommuteFavoriteSchema } from "../domain/commute";
import type { LiveSnapshot } from "../domain/liveCommuteQueries";
import { normalizeArrivals } from "../domain/bus";
import { FavoriteDepartures } from "./FavoriteDepartures";

const NOW = Date.UTC(2026, 7, 20, 3, 10);
const favorite = busCommuteFavoriteSchema.parse({
  id: "fav-bus",
  kind: "bus",
  stopId: "124000454",
  arsId: "25014",
  routeId: "100100574",
  routeName: "341",
  direction: "강동공영차고지",
  accessMinutes: 1,
});
const arrivals = normalizeArrivals({
  resultList: [{
    busRouteId: favorite.routeId,
    rtNm: favorite.routeName,
    adirection: favorite.direction,
    arrmsg1: "10분후",
    arrmsg2: "2분후",
    routeType: "간선",
    busType1: "0",
    congetion1: "0",
  }],
});
const props = {
  favorites: [favorite],
  now: NOW,
  onUpdateFavorite: vi.fn(),
  onUnpinFavorite: vi.fn(),
} satisfies Omit<ComponentProps<typeof FavoriteDepartures>, "snapshots">;

function snapshot(status: LiveSnapshot["latestAttemptStatus"]): LiveSnapshot {
  return {
    query: {
      kind: "bus",
      key: `bus:${favorite.arsId}`,
      args: { arsId: favorite.arsId },
      stopIds: [favorite.stopId],
    },
    latestAttemptAt: NOW,
    latestAttemptStatus: status,
    lastSuccess: { updatedAt: NOW, arrivals },
    error: status === "failure" ? "연결 실패" : null,
  };
}

describe("FavoriteDepartures visual hierarchy", () => {
  it("renders the first matching departure as a primary ETA and the second as supporting data", () => {
    // Given: a saved route with two exact upcoming departures.
    const { container } = render(<FavoriteDepartures {...props} snapshots={new Map([[`bus:${favorite.arsId}`, snapshot("success")]])} />);

    // When: the favorite departure board renders the ordered arrivals.
    const primaryEta = container.querySelector(".favorite-departure-times li:first-child > *");
    const supportingEta = container.querySelector(".favorite-departure-times li:nth-child(2) > *");

    // Then: the first ETA owns the prominent semantic and styling hook, unlike the second.
    expect([primaryEta?.tagName, primaryEta?.className, supportingEta?.tagName, supportingEta?.className]).toEqual([
      "STRONG", "favorite-primary-eta", "SPAN", "favorite-secondary-eta",
    ]);
  });

  it("announces a partial refresh failure with an alert icon and concise status text", () => {
    // Given: the latest refresh failed while the last successful data remains.
    render(<FavoriteDepartures {...props} snapshots={new Map([[`bus:${favorite.arsId}`, snapshot("failure")]])} />);

    // When: the failed favorite status is exposed to assistive technology.
    const failureStatus = screen.getByRole("alert");

    // Then: the alert carries one concise status and a decorative Lucide icon.
    expect([failureStatus.textContent?.trim().length > 0, failureStatus.querySelector("svg[aria-hidden='true']") !== null]).toEqual([
      true, true,
    ]);
  });
});
