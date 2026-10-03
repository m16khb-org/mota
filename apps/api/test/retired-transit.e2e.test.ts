import { describe, expect, it, vi } from "vitest";
import { createApp } from "./create-test-app";

describe("retired transit APIs", () => {
  it.each([
    "/api/subway/nearby?lat=37.5665&lng=126.978&radius=800",
    "/api/subway/arrivals?station=서울역",
    "/api/transit-map/network?west=126.97&south=37.56&east=126.98&north=37.57",
    "/api/transit-map/events",
  ])("returns 404 without upstream calls for %s", async (url) => {
    const upstream = vi.fn().mockRejectedValue(new Error("Unexpected upstream call"));
    const response = await createApp(upstream).request(url, {
      headers: { accept: "text/html" },
    });
    expect(response.status).toBe(404);
    expect(upstream).not.toHaveBeenCalled();
  });
});
