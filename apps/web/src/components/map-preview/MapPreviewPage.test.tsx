// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LiveTransitMapState } from "./useLiveTransitMap";
import { useLiveTransitMap } from "./useLiveTransitMap";
import { MapPreviewPage } from "./MapPreviewPage";

vi.mock("./useLiveTransitMap", async (importOriginal) => {
	const original = await importOriginal<typeof import("./useLiveTransitMap")>();
	return { ...original, useLiveTransitMap: vi.fn() };
});

vi.mock("./MapLibrePreviewMap", () => ({
	MapLibrePreviewMap: (props: {
		onReady: () => void;
		onViewportChange?: (viewport: {
			west: number;
			south: number;
			east: number;
			north: number;
			zoom: number;
		}) => void;
		onTransitSelect?: (selection: {
			key: string;
			mode: "bus" | "subway";
			kind: "station";
			name: string;
			detail: string;
			coordinates: [number, number];
		}) => void;
		network?: typeof network;
		vehicles?: LiveTransitMapState["vehicles"];
	}) => (
		<section aria-label="지도 테스트 표면">
			<output aria-label="지도 버스 수">{props.vehicles?.bus.length ?? 0}</output>
			<output aria-label="지도 지하철 수">{props.vehicles?.subway.length ?? 0}</output>
			<output aria-label="지도 버스 노선 수">
				{props.network?.bus.routes.features.length ?? 0}
			</output>
			<button type="button" onClick={props.onReady}>지도 준비</button>
			<button
				type="button"
				onClick={() =>
					props.onViewportChange?.({
						west: 127.1,
						south: 37.52,
						east: 127.12,
						north: 37.54,
						zoom: 16,
					})
				}
			>
				지도 확대
			</button>
			<button
				type="button"
				onClick={() =>
					props.onTransitSelect?.({
						key: "station-a",
						mode: "subway",
						kind: "station",
						name: "천호",
						detail: "5호선 · 8호선",
						coordinates: [127.123, 37.538],
					})
				}
			>
				지도 역 선택
			</button>
		</section>
	),
}));

const stationFeature = {
	type: "Feature" as const,
	properties: { stationId: "station-a", stationName: "천호", routeIds: ["5", "8"] },
	geometry: { type: "Point" as const, coordinates: [127.123, 37.538] as [number, number] },
};
const busStopFeature = {
	type: "Feature" as const,
	properties: {
		stopId: "stop-a",
		arsId: "25014",
		stopName: "천호역 정류장",
		routeIds: ["124100001"],
	},
	geometry: { type: "Point" as const, coordinates: [127.125, 37.537] as [number, number] },
};
const routeFeature = {
	type: "Feature" as const,
	properties: { routeId: "124100001", routeName: "341", color: "#2563eb" },
	geometry: {
		type: "LineString" as const,
		coordinates: [
			[127.12, 37.53] as [number, number],
			[127.13, 37.54] as [number, number],
		],
	},
};
const network = {
	revision: "revision-1",
	generatedAt: "2026-09-05T00:00:00.000Z",
	subway: {
		attribution: "© OpenStreetMap contributors, ODbL",
		lines: { type: "FeatureCollection" as const, features: [routeFeature] },
		stations: { type: "FeatureCollection" as const, features: [stationFeature] },
	},
	bus: {
		enabled: true,
		attribution: "서울특별시 교통정보",
		routes: { type: "FeatureCollection" as const, features: [routeFeature] },
		stops: { type: "FeatureCollection" as const, features: [busStopFeature] },
	},
};
const train = {
	id: "subway:1008:8120",
	mode: "subway" as const,
	routeId: "1008",
	routeName: "8호선",
	coordinates: [127.11, 37.53] as [number, number],
	bearing: 0,
	direction: "상행",
	capturedAt: "2026-09-05T04:20:15.000Z",
	positionBasis: "station-segment" as const,
};
const bus = {
	...train,
	id: "bus:124100001:vehicle-a",
	mode: "bus" as const,
	routeId: "124100001",
	routeName: "341",
	positionBasis: "gps" as const,
};

const liveState: LiveTransitMapState = {
	loading: false,
	network,
	availability: { bus: "live", subway: "live" },
	vehicles: { bus: [bus], subway: [train] },
	connection: "live",
	lastServerTime: "2026-09-05T04:20:15.000Z",
	error: null,
};

describe("MapPreviewPage live operations board", () => {
	beforeEach(() => {
		vi.mocked(useLiveTransitMap).mockReturnValue(liveState);
	});

	it("shows one live status, layer toggles, counts, and a collapsed list alternative", () => {
		render(<MapPreviewPage />);

		expect(screen.getByRole("link", { name: "모타로 돌아가기" })).toHaveAttribute("href", "/");
		expect(screen.getByRole("status", { name: "실시간 운행 상태" })).toHaveTextContent(
			"실시간 연결됨 · 04:20:15",
		);
		expect(document.querySelectorAll("[aria-live]")).toHaveLength(1);
		expect(screen.getByRole("button", { name: "지하철 표시" })).toHaveAttribute("aria-pressed", "true");
		expect(screen.getByRole("button", { name: "버스 표시" })).toHaveAttribute("aria-pressed", "true");
		expect(screen.getAllByText("1대 운행 중", { selector: "strong" })).toHaveLength(2);
		const list = screen.getByText(/전체 지점 목록/).closest("details");
		expect(list).not.toHaveAttribute("open");
		expect(document.body).not.toHaveTextContent(/시간표|모의 차량|오래된 위치/);
	});

	it.each([
		["reconnecting", { bus: "live", subway: "live" }, "재연결 중 · 차량을 숨겼습니다"],
		["live", { bus: "live", subway: "no-service" }, "지하철 운행 정보 없음"],
		["live", { bus: "unavailable", subway: "live" }, "버스 실시간 정보를 불러오지 못했습니다"],
		["live", { bus: "unconfigured", subway: "live" }, "버스 API 설정이 필요합니다"],
		["live", { bus: "zoom-required", subway: "live" }, "더 확대하면 현재 화면의 버스를 표시합니다"],
	] as const)("renders %s/%j without stale vehicles", (connection, availability, copy) => {
		vi.mocked(useLiveTransitMap).mockReturnValue({
			...liveState,
			connection,
			availability,
			vehicles: connection === "reconnecting" ? { bus: [], subway: [] } : liveState.vehicles,
		});
		render(<MapPreviewPage />);
		expect(screen.getByText(copy)).toBeVisible();
	});

	it("toggles rendered sources without changing the stream hook", () => {
		render(<MapPreviewPage />);
		const busToggle = screen.getByRole("button", { name: "버스 표시" });
		expect(screen.getByLabelText("지도 버스 수")).toHaveTextContent("1");
		expect(screen.getByLabelText("지도 버스 노선 수")).toHaveTextContent("1");

		fireEvent.click(busToggle);
		expect(busToggle).toHaveAttribute("aria-pressed", "false");
		expect(screen.getByLabelText("지도 버스 수")).toHaveTextContent("0");
		expect(screen.getByLabelText("지도 버스 노선 수")).toHaveTextContent("0");
		expect(useLiveTransitMap).toHaveBeenCalled();
	});

	it("synchronizes map selection with an accessible details panel", () => {
		render(<MapPreviewPage />);
		fireEvent.click(screen.getByRole("button", { name: "지도 역 선택" }));

		const selected = screen.getByRole("region", { name: "선택한 지점" });
		expect(selected).toHaveTextContent("천호");
		expect(selected).toHaveTextContent("5호선 · 8호선");
	});
});
