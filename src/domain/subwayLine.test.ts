import { describe, expect, it } from "vitest";
import { verifySubwayLeg } from "./subwayLine";

const board = { name: "강동구청", lat: 37.5345, lng: 127.1312 };

describe("verifySubwayLeg", () => {
  it("verifies a train whose via label names the waypoint", () => {
    const result = verifySubwayLeg({
      boardName: board.name,
      board,
      alightName: "천호",
      alight: { lat: 37.5385, lng: 127.1234 },
      directionLabel: "5호선 별내행 - 천호(풍납토성)방면",
    });
    expect(result).not.toBeNull();
    expect(result?.basis).toBe("via");
    expect(result?.alightName).toBe("천호");
    expect(result?.pathMinutes).toBeGreaterThan(0);
  });

  it("verifies a train whose terminus is the waypoint", () => {
    const result = verifySubwayLeg({
      boardName: board.name,
      board,
      alightName: "모란",
      alight: { lat: 37.4283, lng: 127.1281 },
      directionLabel: "8호선 모란행 - 몽촌토성(평화의문)방면",
    });
    expect(result?.basis).toBe("terminus");
  });

  it("rejects a train whose label names neither terminus nor via as the waypoint", () => {
    const result = verifySubwayLeg({
      boardName: board.name,
      board,
      alightName: "잠실",
      alight: { lat: 37.5133, lng: 127.1002 },
      directionLabel: "8호선 모란행 - 몽촌토성(평화의문)방면",
    });
    expect(result).toBeNull();
  });

  it("rejects when the via label is the boarding station itself (train arriving, not departing toward the waypoint)", () => {
    const result = verifySubwayLeg({
      boardName: "천호",
      board: { lat: 37.5385, lng: 127.1234 },
      alightName: "강동구청",
      alight: { lat: 37.5345, lng: 127.1312 },
      directionLabel: "8호선 모란행 - 천호(풍납토성)방면",
    });
    expect(result).toBeNull();
  });

  it("matches the official parenthesized name against the short form", () => {
    const result = verifySubwayLeg({
      boardName: "암사",
      board: { lat: 37.5495, lng: 127.1273 },
      alightName: "천호",
      alight: { lat: 37.5385, lng: 127.1234 },
      directionLabel: "8호선 별내행 - 천호(풍납토성)방면",
    });
    expect(result?.basis).toBe("via");
  });
});
