import { describe, expect, it } from "vitest";
import {
  normalizeArrivals,
  normalizeNearbyStops,
  parseArrivalSeconds,
} from "./bus";

describe("normalizeNearbyStops", () => {
  it("maps the official nearby-stop response into stable stop identities", () => {
    const stops = normalizeNearbyStops({
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
    });

    expect(stops).toEqual([
      {
        id: "124000454",
        arsId: "25014",
        name: "천호역",
        lat: 37.5379482005,
        lng: 127.1255385876,
        distanceMeters: 151,
      },
    ]);
  });
});

describe("normalizeArrivals", () => {
  it("sorts active routes by ETA and keeps inactive routes last", () => {
    const arrivals = normalizeArrivals({
      resultList: [
        {
          busRouteId: "2",
          rtNm: "341",
          adirection: "강동공영차고지",
          arrmsg1: "12분20초후[5번째 전]",
          arrmsg2: "24분후[11번째 전]",
          arrmsgSec1: "12분20초후[5번째 전]",
          arrmsgSec2: "24분후[11번째 전]",
          sectOrd1: "83",
          sectOrd2: "77",
          routeType: "3",
          busType1: "1",
          congetion1: "4",
        },
        {
          busRouteId: "1",
          rtNm: "강동05",
          adirection: "천호역",
          arrmsg1: "3분1초후[1번째 전]",
          arrmsg2: "출발대기",
          arrmsgSec1: "3분1초후[1번째 전]",
          arrmsgSec2: "출발대기",
          sectOrd1: "42",
          sectOrd2: "0",
          routeType: "2",
          busType1: "1",
          congetion1: "3",
        },
        {
          busRouteId: "3",
          rtNm: "N30",
          adirection: "서울역",
          arrmsg1: "운행종료",
          arrmsg2: "운행종료",
          arrmsgSec1: "운행종료",
          arrmsgSec2: "운행종료",
          sectOrd1: "0",
          sectOrd2: "0",
          routeType: "15",
          busType1: "0",
          congetion1: "0",
        },
      ],
    });

    expect(arrivals.map(({ routeName }) => routeName)).toEqual(["강동05", "341", "N30"]);
    expect(arrivals[0]?.first.seconds).toBe(181);
    expect(arrivals[0]?.first.remainingStops).toBe(1);
    expect(arrivals[0]?.first.congestion).toBe("여유");
    expect(arrivals[0]?.lowFloor).toBe(true);
    expect(arrivals[2]?.first.seconds).toBeNull();
  });
});

describe("parseArrivalSeconds", () => {
  it.each([
    ["곧 도착", 30],
    ["3분1초후[1번째 전]", 181],
    ["42초후", 42],
    ["출발대기", null],
  ])("%s -> %s", (message, expected) => {
    expect(parseArrivalSeconds(message)).toBe(expected);
  });
});
