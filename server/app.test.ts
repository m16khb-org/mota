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

  it("rejects coordinates outside the Seoul service boundary", async () => {
    const upstream = vi.fn();
    const response = await createApp(upstream).request(
      "/api/stops/nearby?lat=35.1796&lng=129.0756&radius=800",
    );

    expect(response.status).toBe(400);
    expect(upstream).not.toHaveBeenCalled();
  });
});
