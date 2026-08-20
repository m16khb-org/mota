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
});
