// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SubwayVehicle } from "@mota/contracts/transit-map";
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
			mode: "subway";
			kind: "station";
			name: string;
			detail: string;
			coordinates: [number, number];
		}) => void;
		network?: typeof network;
		vehicles?: readonly SubwayVehicle[];
	}) => (
		<section aria-label="지도 테스트 표면">
			<output aria-label="지도 지하철 수">{props.vehicles?.length ?? 0}</output>
			<output aria-label="지도 지하철 노선 수">
				{props.network?.subway.lines.features.length ?? 0}
			</output>
			<button type="button" onClick={props.onReady}>
				지도 준비
			</button>
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
const routeFeature = {
	type: "Feature" as const,
	properties: { routeId: "5", routeName: "5호선", color: "#2563eb" },
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
};
const train = {
	id: "subway:1008:8120",
	mode: "subway" as const,
	routeId: "1008",
	routeName: "8호선",
	coordinates: [127.12, 37.53] as [number, number],
	bearing: 0,
	direction: "상행",
	capturedAt: "2026-09-05T04:20:15.000Z",
	positionBasis: "station-segment" as const,
};

const liveState: LiveTransitMapState = {
	loading: false,
	network,
	availability: "live",
	vehicles: [train],
	connection: "live",
	lastServerTime: "2026-09-05T04:20:15.000Z",
	error: null,
};

function toggleCount(): number | null {
	const strong = screen
		.getByRole("button", { name: "지하철 표시" })
		.querySelector("strong");
	const digits = strong?.textContent?.match(/\d+/);
	return digits ? Number(digits[0]) : null;
}

describe("MapPreviewPage subway-only operations board", () => {
	beforeEach(() => {
		vi.mocked(useLiveTransitMap).mockReturnValue(liveState);
	});
	afterEach(() => {
		cleanup();
		vi.clearAllMocks();
	});

	it("shows one live status, the subway toggle, and a collapsed list alternative", () => {
		render(<MapPreviewPage />);

		expect(screen.getByRole("link", { name: "모타로 돌아가기" })).toHaveAttribute("href", "/");
		expect(screen.getByRole("status", { name: "실시간 운행 상태" })).toHaveTextContent(
			"실시간 연결됨 · 04:20:15",
		);
		expect(document.querySelectorAll("[aria-live]")).toHaveLength(1);
		expect(screen.getByRole("button", { name: "지하철 표시" })).toHaveAttribute(
			"aria-pressed",
			"true",
		);
		expect(screen.queryByRole("button", { name: "버스 표시" })).not.toBeInTheDocument();
		expect(toggleCount()).toBe(1);
		expect(screen.getByText(/전체 지점 목록/).closest("details")).not.toHaveAttribute(
			"open",
		);
		expect(document.body).not.toHaveTextContent(/버스|정류장/);
	});

	it.each([
		["reconnecting", "live", "재연결 중 · 차량을 숨겼습니다"],
		["live", "no-service", "지하철 운행 정보 없음"],
		["live", "unavailable", "지하철 실시간 정보를 불러오지 못했습니다"],
		["live", "unconfigured", "지하철 API 설정이 필요합니다"],
		["live", "zoom-required", "더 확대하면 지하철 정보를 표시합니다"],
	] as const)("renders %s/%s without stale vehicles", (connection, availability, copy) => {
		vi.mocked(useLiveTransitMap).mockReturnValue({
			...liveState,
			connection,
			availability,
			vehicles: connection === "reconnecting" ? [] : liveState.vehicles,
		});
		render(<MapPreviewPage />);
		expect(screen.getByText(copy)).toBeVisible();
	});

	it("exposes the live subway count as a machine-readable state", () => {
		render(<MapPreviewPage />);

		expect(screen.getByRole("button", { name: "지하철 표시" })).toHaveAttribute(
			"data-vehicle-state",
			"live",
		);
		expect(toggleCount()).toBe(1);
	});

	it("counts only trains inside the viewport without dropping distant trains from the map", () => {
		const distantTrain: SubwayVehicle = {
			...train,
			id: "subway:1008:distant",
			coordinates: [127.2, 37.6],
		};
		vi.mocked(useLiveTransitMap).mockReturnValue({
			...liveState,
			vehicles: [train, distantTrain],
		});
		render(<MapPreviewPage />);

		expect(toggleCount()).toBe(1);
		expect(screen.getByLabelText("지도 지하철 수")).toHaveTextContent("2");
	});

	it("shows a checking state instead of a zero count while the stream is not established", () => {
		vi.mocked(useLiveTransitMap).mockReturnValue({
			...liveState,
			loading: true,
			network: null,
			connection: "loading",
			availability: "unavailable",
			vehicles: [],
			lastServerTime: null,
		});
		render(<MapPreviewPage />);

		const subwayToggle = screen.getByRole("button", { name: "지하철 표시" });
		expect(subwayToggle).toHaveAttribute("data-vehicle-state", "connecting");
		expect(toggleCount()).toBeNull();
		expect(document.querySelector(".map-preview-mode-notices")).toBeEmptyDOMElement();
	});

	it("keeps an authoritative zero for no-service instead of an unknown state", () => {
		vi.mocked(useLiveTransitMap).mockReturnValue({
			...liveState,
			availability: "no-service",
			vehicles: [],
		});
		render(<MapPreviewPage />);

		const subwayToggle = screen.getByRole("button", { name: "지하철 표시" });
		expect(subwayToggle).toHaveAttribute("data-vehicle-state", "no-service");
		expect(toggleCount()).toBe(0);
	});

	it("never counts hidden vehicles while reconnecting or after a failed start", () => {
		vi.mocked(useLiveTransitMap).mockReturnValue({
			...liveState,
			connection: "reconnecting",
			vehicles: [],
		});
		render(<MapPreviewPage />);
		expect(screen.getByRole("button", { name: "지하철 표시" })).toHaveAttribute(
			"data-vehicle-state",
			"reconnecting",
		);
		expect(toggleCount()).toBeNull();
		cleanup();

		vi.mocked(useLiveTransitMap).mockReturnValue({
			...liveState,
			network: null,
			connection: "error",
			availability: "unavailable",
			vehicles: [],
		});
		render(<MapPreviewPage />);
		expect(screen.getByRole("button", { name: "지하철 표시" })).toHaveAttribute(
			"data-vehicle-state",
			"error",
		);
		expect(toggleCount()).toBeNull();
		expect(document.querySelector(".map-preview-mode-notices")).toBeEmptyDOMElement();
	});

	it("toggles rendered subway sources without changing the stream hook", () => {
		render(<MapPreviewPage />);
		const subwayToggle = screen.getByRole("button", { name: "지하철 표시" });
		expect(screen.getByLabelText("지도 지하철 수")).toHaveTextContent("1");
		expect(screen.getByLabelText("지도 지하철 노선 수")).toHaveTextContent("1");

		fireEvent.click(subwayToggle);
		expect(subwayToggle).toHaveAttribute("aria-pressed", "false");
		expect(subwayToggle).toHaveAttribute("data-vehicle-state", "live");
		expect(toggleCount()).toBe(1);
		expect(screen.getByLabelText("지도 지하철 수")).toHaveTextContent("0");
		expect(screen.getByLabelText("지도 지하철 노선 수")).toHaveTextContent("0");
		expect(useLiveTransitMap).toHaveBeenCalled();
	});

	it("synchronizes map station selection with an accessible details panel", () => {
		render(<MapPreviewPage />);
		fireEvent.click(screen.getByRole("button", { name: "지도 역 선택" }));

		const selected = screen.getByRole("region", { name: "선택한 지점" });
		expect(selected).toHaveTextContent("천호");
		expect(selected).toHaveTextContent("5호선 · 8호선");
	});
});
