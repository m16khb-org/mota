import { describe, expect, it } from "vitest";
import { apiStationName, normalizeSubwayArrivals } from "./subway";

const payload = {
  errorMessage: { status: 200, code: "INFO-000", message: "정상 처리되었습니다." },
  realtimeArrivalList: [
    {
      subwayId: "1002",
      updnLine: "하행",
      trainLineNm: "강남방면",
      btrainSttus: "일반",
      barvlDt: "45",
      arvlMsg2: "전역 출발",
      arvlMsg3: "을지로",
      lstcarAt: "0",
      recptnDt: "2026-08-20 12:10:20",
    },
    {
      subwayId: "1001",
      updnLine: "상행",
      trainLineNm: "양주행 - 종각방면",
      btrainSttus: "급행",
      barvlDt: "300",
      arvlMsg2: "2분 후",
      arvlMsg3: "서울역",
      lstcarAt: "1",
      recptnDt: "2026-08-20 12:10:30",
    },
    {
      subwayId: "1099",
      updnLine: "외선",
      trainLineNm: "알 수 없는 노선",
      btrainSttus: "",
      barvlDt: "",
      arvlMsg2: "",
      arvlMsg3: "",
      lstcarAt: null,
      recptnDt: "2026-08-20 12:10:25",
    },
  ],
};

describe("apiStationName", () => {
  it("maps short OSM names to parenthesized official API names", () => {
    expect(apiStationName("천호")).toBe("천호(풍납토성)");
    expect(apiStationName("군자")).toBe("군자(능동)");
    expect(apiStationName("시청")).toBe("시청");
  });
});

describe("normalizeSubwayArrivals", () => {
  it("maps upstream rows to line names, ETAs, and train status", () => {
    const { arrivals } = normalizeSubwayArrivals(payload);

    expect(arrivals).toHaveLength(3);
    const [first, second] = arrivals;
    expect(first?.line).toBe("2호선");
    expect(first?.seconds).toBe(45);
    expect(first?.location).toBe("을지로");
    expect(first?.isLastTrain).toBe(false);
    expect(second?.line).toBe("1호선");
    expect(second?.trainStatus).toBe("급행");
    expect(second?.isLastTrain).toBe(true);
  });

  it("sorts by ETA and demotes unknown lines without seconds", () => {
    const { arrivals } = normalizeSubwayArrivals(payload);

    expect(arrivals.map((arrival) => arrival.seconds)).toEqual([45, 300, null]);
    const [first, , unknown] = arrivals;
    expect(first?.seconds).toBe(45);
    expect(unknown?.line).toBe("기타");
    expect(unknown?.trainStatus).toBe("일반");
  });

  it("converts the latest Seoul receipt time to an ISO instant in KST", () => {
    const { updatedAt } = normalizeSubwayArrivals(payload);

    expect(updatedAt).toBe("2026-08-20T03:10:30.000Z");
  });

  it("returns an empty list for empty upstream results", () => {
    const result = normalizeSubwayArrivals({
      errorMessage: { code: "INFO-000", message: "정상 처리되었습니다." },
      realtimeArrivalList: [],
    });

    expect(result.arrivals).toEqual([]);
  });

  it("distinguishes an unavailable zero ETA from a train arriving now", () => {
    const { arrivals } = normalizeSubwayArrivals({
      errorMessage: { code: "INFO-000", message: "정상 처리되었습니다." },
      realtimeArrivalList: [
        {
          subwayId: "1008",
          updnLine: "상행",
          trainLineNm: "별내행",
          barvlDt: "0",
          arvlCd: "1",
          arvlMsg2: "천호 도착",
          recptnDt: "2026-08-20 12:10:20",
        },
        {
          subwayId: "1008",
          updnLine: "하행",
          trainLineNm: "모란행",
          barvlDt: "0",
          arvlCd: "99",
          arvlMsg2: "[7]번째 전역 (별내)",
          recptnDt: "2026-08-20 12:10:20",
        },
      ],
    });
    const secondsByMessage = new Map(
      arrivals.map((arrival) => [arrival.message, arrival.seconds]),
    );

    expect(secondsByMessage.get("천호 도착")).toBe(0);
    expect(secondsByMessage.get("[7]번째 전역 (별내)")).toBeNull();
  });
});

describe("display identity baseline", () => {
  it("keeps observable line and direction labels stable through normalization", () => {
    const { arrivals } = normalizeSubwayArrivals(payload);
    const [first] = arrivals;

    expect(first?.line).toBe("2호선");
    expect(first?.direction).toBe("강남방면");
    expect(first?.id).toBe("1002-하행-강남방면");
  });
});

describe("stable subway service and direction identity", () => {
  it("propagates subwayId, updnLine, and trainLineNm from the upstream row", () => {
    const { arrivals } = normalizeSubwayArrivals(payload);
    const [first] = arrivals;

    expect(first?.subwayId).toBe("1002");
    expect(first?.updnLine).toBe("하행");
    expect(first?.trainLineNm).toBe("강남방면");
  });

  it("keeps identical display labels with different stable keys distinct", () => {
    const { arrivals } = normalizeSubwayArrivals({
      errorMessage: { code: "INFO-000", message: "정상 처리되었습니다." },
      realtimeArrivalList: [
        {
          subwayId: "1099",
          updnLine: "외선",
          trainLineNm: "성수방면",
          barvlDt: "60",
          recptnDt: "2026-08-20 12:10:20",
        },
        {
          subwayId: "1098",
          updnLine: "내선",
          trainLineNm: "성수방면",
          barvlDt: "90",
          recptnDt: "2026-08-20 12:10:21",
        },
      ],
    });

    expect(arrivals).toHaveLength(2);
    expect(arrivals.map((arrival) => arrival.line)).toEqual(["기타", "기타"]);
    expect(arrivals.map((arrival) => arrival.direction)).toEqual([
      "성수방면",
      "성수방면",
    ]);
    expect(
      arrivals.map((arrival) => `${arrival.subwayId}|${arrival.updnLine}`),
    ).toEqual(["1099|외선", "1098|내선"]);
    expect(new Set(arrivals.map((arrival) => arrival.id)).size).toBe(2);
  });

  it("rejects upstream rows that lack the stable subwayId key", () => {
    expect(() =>
      normalizeSubwayArrivals({
        errorMessage: { code: "INFO-000", message: "정상 처리되었습니다." },
        realtimeArrivalList: [
          {
            updnLine: "하행",
            trainLineNm: "강남방면",
            barvlDt: "45",
            recptnDt: "2026-08-20 12:10:20",
          },
        ],
      }),
    ).toThrow();
  });

  it("rejects upstream rows that lack the stable updnLine key", () => {
    expect(() =>
      normalizeSubwayArrivals({
        errorMessage: { code: "INFO-000", message: "정상 처리되었습니다." },
        realtimeArrivalList: [
          {
            subwayId: "1002",
            trainLineNm: "강남방면",
            barvlDt: "45",
            recptnDt: "2026-08-20 12:10:20",
          },
        ],
      }),
    ).toThrow();
  });
});
