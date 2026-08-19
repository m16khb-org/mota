import { describe, expect, it, vi } from "vitest";
import { createApp } from "./app";

describe("bus API adapter", () => {
  it("normalizes nearby stops from the official Seoul transit response", async () => {
    const upstream = vi.fn().mockResolvedValue(
      Response.json({
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
      }),
    );
    const response = await createApp(upstream).request(
      "/api/stops/nearby?lat=37.5366&lng=127.1253&radius=800",
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      stops: [{ name: "천호역", arsId: "25014" }],
    });
    expect(upstream).toHaveBeenCalledWith(
      expect.stringContaining("selectNearStops.do?kiloMeter=0.8"),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it("normalizes and sorts live arrivals from the Hermes BIS source", async () => {
    const upstream = vi.fn().mockResolvedValue(
      Response.json({
        error: { errorMessage: "성공", errorCode: "0000" },
        resultList: [
          {
            busRouteId: "124900001",
            rtNm: "강동05",
            adirection: "강동공영차고지",
            arrmsg1: "8분1초후[3번째 전]",
            arrmsg2: "23분6초후[15번째 전]",
            arrmsgSec1: "481",
            arrmsgSec2: "1386",
            sectOrd1: "3",
            sectOrd2: "15",
            routeType: "2",
            busType1: "1",
            congetion1: "3",
          },
        ],
      }),
    );
    const response = await createApp(upstream).request("/api/arrivals/25162");

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      arrivals: [
        {
          routeName: "강동05",
          first: { seconds: 481, congestion: "여유" },
        },
      ],
    });
    expect(upstream).toHaveBeenCalledWith(
      "http://m.bus.go.kr/mBus/bus/getStationByUid.bms",
      expect.objectContaining({
        method: "POST",
        body: "arsId=25162",
      }),
    );
  });

  it("adds nearby subway stations as route points", async () => {
    const upstream = vi.fn().mockResolvedValue(
      Response.json({
        elements: [
          {
            type: "node",
            id: 5801572034,
            lat: 37.5385225,
            lon: 127.1234021,
            tags: {
              name: "천호",
              network: "수도권 전철",
            },
          },
        ],
      }),
    );
    const response = await createApp(upstream, {
      sleep: () => new Promise(() => {}),
    }).request("/api/subway/nearby?lat=37.5366&lng=127.1253&radius=3000");

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      stations: [
        {
          id: "osm-node-5801572034",
          name: "천호",
          line: "수도권 전철",
          lat: 37.5385225,
          lng: 127.1234021,
        },
      ],
    });
    expect(upstream).toHaveBeenCalledWith(
      "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
      expect.objectContaining({
        method: "POST",
        body: expect.any(URLSearchParams),
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it("rejects coordinates outside the Seoul service boundary", async () => {
    const upstream = vi.fn();
    const response = await createApp(upstream).request(
      "/api/stops/nearby?lat=35.1796&lng=129.0756&radius=800",
    );

    expect(response.status).toBe(400);
    expect(upstream).not.toHaveBeenCalled();
  });

  it("serves repeated subway searches from cache without recalling Overpass", async () => {
    const upstream = vi.fn().mockResolvedValue(
      Response.json({
        elements: [
          {
            type: "node",
            id: 5801572034,
            lat: 37.5385225,
            lon: 127.1234021,
            tags: { name: "천호", network: "수도권 전철" },
          },
        ],
      }),
    );
    const app = createApp(upstream, { sleep: () => new Promise(() => {}) });
    const url = "/api/subway/nearby?lat=37.5366&lng=127.1253&radius=3000";

    const first = await app.request(url);
    const second = await app.request(url);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(upstream).toHaveBeenCalledTimes(1);
    expect(await second.json()).toMatchObject({
      stations: [{ name: "천호" }],
    });
  });

  it("falls back to the next Overpass mirror when the primary fails", async () => {
    const upstream = vi
      .fn()
      .mockRejectedValueOnce(new Error("primary unavailable"))
      .mockImplementation(() => new Promise<Response>(() => {}))
      .mockResolvedValueOnce(
        Response.json({
          elements: [
            {
              type: "node",
              id: 5801572034,
              lat: 37.5385225,
              lon: 127.1234021,
              tags: { name: "천호", network: "수도권 전철" },
            },
          ],
        }),
      );
    const response = await createApp(upstream, { sleep: async () => {} }).request(
      "/api/subway/nearby?lat=37.5366&lng=127.1253&radius=3000",
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      stations: [{ name: "천호" }],
    });
    expect(upstream).toHaveBeenNthCalledWith(
      1,
      "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
      expect.objectContaining({ method: "POST" }),
    );
    expect(upstream).toHaveBeenNthCalledWith(
      2,
      "https://overpass.kumi.systems/api/interpreter",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("returns the fastest mirror response when staggered attempts race", async () => {
    const pending = () => new Promise<Response>(() => {});
    const upstream = vi
      .fn()
      .mockImplementationOnce(pending)
      .mockImplementationOnce(() =>
        Promise.resolve(
          Response.json({
            elements: [
              {
                type: "node",
                id: 5801572035,
                lat: 37.5385225,
                lon: 127.1234021,
                tags: { name: "송파", network: "수도권 전철" },
              },
            ],
          }),
        ),
      )
      .mockImplementationOnce(pending);
    const response = await createApp(upstream, {
      sleep: async () => {},
    }).request("/api/subway/nearby?lat=37.5366&lng=127.1253&radius=3000");

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      stations: [{ name: "송파" }],
    });
    expect(upstream).toHaveBeenCalledTimes(4);
  });

  it("skips later mirrors once an earlier mirror wins the race", async () => {
    const upstream = vi.fn().mockImplementation((endpoint: unknown) =>
      String(endpoint).includes("mail.ru")
        ? Promise.resolve(
            Response.json({
              elements: [
                {
                  type: "node",
                  id: 5801572034,
                  lat: 37.5385225,
                  lon: 127.1234021,
                  tags: { name: "천호", network: "수도권 전철" },
                },
              ],
            }),
          )
        : new Promise<Response>(() => {}),
    );
    const response = await createApp(upstream).request(
      "/api/subway/nearby?lat=37.5366&lng=127.1253&radius=3000",
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      stations: [{ name: "천호" }],
    });
    expect(upstream).toHaveBeenCalledTimes(1);
    expect(upstream).toHaveBeenCalledWith(
      "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("serves stale cached stations when every mirror fails", async () => {
    let now = 1_000_000;
    const upstream = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          elements: [
            {
              type: "node",
              id: 5801572034,
              lat: 37.5385225,
              lon: 127.1234021,
              tags: { name: "천호", network: "수도권 전철" },
            },
          ],
        }),
      )
      .mockRejectedValue(new Error("overpass down"));
    const app = createApp(upstream, { now: () => now, sleep: async () => {} });
    const url = "/api/subway/nearby?lat=37.5366&lng=127.1253&radius=3000";

    const first = await app.request(url);
    now += 25 * 60 * 60 * 1_000;
    const second = await app.request(url);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(await second.json()).toMatchObject({
      stations: [{ name: "천호" }],
    });
  });

  it("reports upstream failure when no cached stations exist", async () => {
    const upstream = vi.fn().mockRejectedValue(new Error("overpass down"));
    const response = await createApp(upstream, {
      now: () => 0,
      sleep: async () => {},
    }).request("/api/subway/nearby?lat=37.5366&lng=127.1253&radius=3000");

    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({
      error: "UPSTREAM_UNAVAILABLE",
    });
  });
});
