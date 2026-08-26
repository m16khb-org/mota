import { describe, expect, it, vi } from "vitest";
import { createApp } from "./create-test-app";

const stopPayload = {
  ResponseVO: {
    data: {
      resultList: [
        {
          strid: 124000454,
          strnm: "천호역",
          strno: "25014",
          diffMeter: 151,
          posX: 127.1255385876,
          posY: 37.5379482005,
        },
      ],
    },
  },
};

describe("bus catalog fallback", () => {
  it("uses the live nearby lookup when the complete catalog is rejected", async () => {
    // Given: the complete-catalog response is below the production threshold,
    // while the location-scoped endpoint can still return usable stops.
    const upstream = vi
      .fn()
      .mockResolvedValueOnce(Response.json(stopPayload))
      .mockResolvedValueOnce(Response.json(stopPayload));
    const app = createApp(upstream, { minimumBusCatalogItems: 2 });

    // When
    const response = await app.request(
      "/api/stops/nearby?lat=37.5366&lng=127.1253&radius=800",
    );

    // Then
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      stops: [{ name: "천호역", arsId: "25014" }],
    });
    expect(upstream).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("kiloMeter=45"),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(upstream).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("kiloMeter=0.8"),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });
});
