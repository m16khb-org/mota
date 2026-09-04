// @vitest-environment jsdom

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	fetchNearbyStops,
	fetchNearbySubwayStations,
} from "../../api/client";
import { busStopSchema, type BusStop } from "../../domain/bus";
import {
	subwayStationSchema,
	type SubwayStation,
} from "../../domain/subway";
import type {
	MapLibrePreviewMapProps,
	MapPreviewFatal,
} from "./MapLibrePreviewMap";
import { MapPreviewPage } from "./MapPreviewPage";

vi.mock("../../api/client", async (importOriginal) => {
	const original = await importOriginal<typeof import("../../api/client")>();
	return {
		...original,
		fetchNearbyStops: vi.fn<typeof original.fetchNearbyStops>(),
		fetchNearbySubwayStations:
			vi.fn<typeof original.fetchNearbySubwayStations>(),
	};
});

vi.mock("./MapLibrePreviewMap", () => ({
	MapLibrePreviewMap: ({
		center,
		onReady,
		onCenterChange,
		onFatal,
		onDegraded,
		points,
		activePointKey,
		onActivePointChange,
	}: MapLibrePreviewMapProps) => (
		<section aria-label="지도 테스트 표면">
			<output aria-label="지도 중심">{`${center.lat},${center.lng}`}</output>
			<output aria-label="지도 지점">
				{points.map((point) => point.name).join(",") || "없음"}
			</output>
			<output aria-label="지도 활성 지점">
				{activePointKey ?? "없음"}
			</output>
			<button type="button" onClick={onReady}>
				지도 준비 완료
			</button>
			<button
				type="button"
				onClick={() =>
					onCenterChange({ lat: 37.541234, lng: 127.131234 })
				}
			>
				지도 중심 이동
			</button>
			<button
				type="button"
				onClick={() =>
					onCenterChange({ lat: 37.551234, lng: 127.141234 })
				}
			>
				지도 중심 다시 이동
			</button>
			<button
				type="button"
				onClick={() => onActivePointChange(points[0]?.key ?? null)}
			>
				지도 첫 지점 선택
			</button>
			<button
				type="button"
				onClick={() =>
					onDegraded({ kind: "resource", error: new Error("tile") })
				}
			>
				지도 리소스 실패
			</button>
			{(
				[
					"construction",
					"style",
					"missing-building-layer",
					"webgl-context-lost",
				] satisfies MapPreviewFatal["kind"][]
			).map((kind) => (
				<button
					key={kind}
					type="button"
					onClick={() => onFatal({ kind, error: new Error(kind) })}
				>
					{kind} 실패
				</button>
			))}
		</section>
	),
}));

interface Deferred<T> {
	readonly promise: Promise<T>;
	readonly resolve: (value: T) => void;
	readonly reject: (reason: unknown) => void;
}

function deferred<T>(): Deferred<T> {
	let resolve!: (value: T) => void;
	let reject!: (reason: unknown) => void;
	const promise = new Promise<T>((nextResolve, nextReject) => {
		resolve = nextResolve;
		reject = nextReject;
	});
	return { promise, resolve, reject };
}

async function settle<T>(request: Deferred<T>, value: T) {
	await act(async () => {
		request.resolve(value);
		await request.promise;
	});
}

async function fail<T>(request: Deferred<T>, error: Error) {
	await act(async () => {
		request.reject(error);
		await request.promise.catch(() => undefined);
	});
}

const busA = busStopSchema.parse({
	id: "bus-a",
	arsId: "12345",
	name: "천호역 정류장",
	lat: 37.5367,
	lng: 127.1254,
	distanceMeters: 20,
});

const busB = busStopSchema.parse({
	id: "bus-b",
	arsId: "67890",
	name: "강동역 정류장",
	lat: 37.5413,
	lng: 127.1313,
	distanceMeters: 30,
});

const stationA = subwayStationSchema.parse({
	id: "station-a",
	name: "천호",
	line: "5호선",
	lat: 37.538,
	lng: 127.123,
	distanceMeters: 180,
});

const stationB = subwayStationSchema.parse({
	id: "station-b",
	name: "강동",
	line: "5호선",
	lat: 37.535,
	lng: 127.132,
	distanceMeters: 220,
});

describe("MapPreviewPage", () => {
	beforeEach(() => {
		vi.mocked(fetchNearbyStops).mockReset();
		vi.mocked(fetchNearbySubwayStations).mockReset();
		vi.mocked(fetchNearbyStops).mockResolvedValue([]);
		vi.mocked(fetchNearbySubwayStations).mockResolvedValue([]);
	});

	it("shows the public preview shell while initial data is loading, then shares points and active state with the map and list", async () => {
		const firstBus = deferred<BusStop[]>();
		const firstSubway = deferred<SubwayStation[]>();
		const secondBus = deferred<BusStop[]>();
		const secondSubway = deferred<SubwayStation[]>();
		vi.mocked(fetchNearbyStops)
			.mockReturnValueOnce(firstBus.promise)
			.mockReturnValueOnce(secondBus.promise);
		vi.mocked(fetchNearbySubwayStations)
			.mockReturnValueOnce(firstSubway.promise)
			.mockReturnValueOnce(secondSubway.promise);

		render(<MapPreviewPage />);

		expect(screen.getByRole("link", { name: /모타로 돌아가기/ })).toHaveAttribute(
			"href",
			"/",
		);
		expect(screen.getByText("실험용 미리보기")).toBeInTheDocument();
		expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("3D 지도");
		expect(screen.getByRole("status", { name: "3D 지도 상태" })).toHaveTextContent(
			/준비/,
		);
		expect(screen.getByRole("status", { name: "버스 정류장 상태" })).toHaveTextContent(
			/불러오는 중/,
		);
		expect(screen.getByRole("status", { name: "지하철역 상태" })).toHaveTextContent(
			/불러오는 중/,
		);
		expect(screen.getByLabelText("버스 정류장 수")).toHaveTextContent("0곳");
		expect(screen.getByLabelText("지하철역 수")).toHaveTextContent("0곳");
		expect(screen.getByLabelText("지도 중심")).toHaveTextContent(
			"37.5366,127.1253",
		);

		await settle(firstBus, [busA]);
		await settle(firstSubway, [stationA]);

		expect(screen.getByLabelText("버스 정류장 수")).toHaveTextContent("1곳");
		expect(screen.getByLabelText("지하철역 수")).toHaveTextContent("1곳");
		expect(screen.getByLabelText("지도 지점")).toHaveTextContent(
			"천호역 정류장,천호",
		);
		const busListButton = screen.getByRole("button", {
			name: /버스 천호역 정류장/,
		});
		expect(busListButton).toHaveAttribute("aria-pressed", "false");
		fireEvent.click(screen.getByRole("button", { name: "지도 첫 지점 선택" }));
		expect(busListButton).toHaveAttribute("aria-pressed", "true");
		expect(screen.getByLabelText("지도 활성 지점")).toHaveTextContent("bus:bus-a");
		fireEvent.click(screen.getByRole("button", { name: /지하철 천호/ }));
		expect(busListButton).toHaveAttribute("aria-pressed", "false");
		expect(screen.getByLabelText("지도 활성 지점")).toHaveTextContent(
			"subway:station-a",
		);

		fireEvent.click(screen.getByRole("button", { name: "지도 중심 이동" }));
		expect(screen.getByLabelText("지도 중심")).toHaveTextContent(
			"37.541234,127.131234",
		);
		await settle(secondBus, [busB]);
		await settle(secondSubway, [stationB]);

		expect(await screen.findByRole("button", { name: /버스 강동역 정류장/ })).toBeVisible();
		expect(screen.getByLabelText("지도 지점")).toHaveTextContent(
			"강동역 정류장,강동",
		);
	});

	it("keeps bus failure independent and retries only the bus catalog", async () => {
		const failedBus = deferred<BusStop[]>();
		const successfulSubway = deferred<SubwayStation[]>();
		const retriedBus = deferred<BusStop[]>();
		vi.mocked(fetchNearbyStops)
			.mockReturnValueOnce(failedBus.promise)
			.mockReturnValueOnce(retriedBus.promise);
		vi.mocked(fetchNearbySubwayStations).mockReturnValue(successfulSubway.promise);

		render(<MapPreviewPage />);
		await fail(failedBus, new Error("private upstream detail"));
		await settle(successfulSubway, [stationA]);

		const busAlert = screen.getByRole("alert", { name: "버스 정류장 오류" });
		expect(busAlert).toHaveTextContent(/불러오지 못/);
		expect(busAlert).not.toHaveTextContent("private upstream detail");
		expect(screen.getByRole("button", { name: /지하철 천호/ })).toBeVisible();

		fireEvent.click(screen.getByRole("button", { name: "버스 정류장 다시 시도" }));
		expect(fetchNearbyStops).toHaveBeenCalledTimes(2);
		expect(fetchNearbySubwayStations).toHaveBeenCalledTimes(1);
		await settle(retriedBus, [busA]);
		expect(await screen.findByRole("button", { name: /버스 천호역 정류장/ })).toBeVisible();
	});

	it("keeps subway failure independent and retries only the subway catalog", async () => {
		const successfulBus = deferred<BusStop[]>();
		const failedSubway = deferred<SubwayStation[]>();
		const retriedSubway = deferred<SubwayStation[]>();
		vi.mocked(fetchNearbyStops).mockReturnValue(successfulBus.promise);
		vi.mocked(fetchNearbySubwayStations)
			.mockReturnValueOnce(failedSubway.promise)
			.mockReturnValueOnce(retriedSubway.promise);

		render(<MapPreviewPage />);
		await settle(successfulBus, [busA]);
		await fail(failedSubway, new Error("private subway detail"));

		const subwayAlert = screen.getByRole("alert", { name: "지하철역 오류" });
		expect(subwayAlert).toHaveTextContent(/불러오지 못/);
		expect(subwayAlert).not.toHaveTextContent("private subway detail");
		expect(screen.getByRole("button", { name: /버스 천호역 정류장/ })).toBeVisible();

		fireEvent.click(screen.getByRole("button", { name: "지하철역 다시 시도" }));
		expect(fetchNearbyStops).toHaveBeenCalledTimes(1);
		expect(fetchNearbySubwayStations).toHaveBeenCalledTimes(2);
		await settle(retriedSubway, [stationA]);
		expect(await screen.findByRole("button", { name: /지하철 천호/ })).toBeVisible();
	});

	it("clears a disappeared active key so the same key cannot reactivate when it returns", async () => {
		const busRequests = [
			deferred<BusStop[]>(),
			deferred<BusStop[]>(),
			deferred<BusStop[]>(),
		] as const;
		const subwayRequests = [
			deferred<SubwayStation[]>(),
			deferred<SubwayStation[]>(),
			deferred<SubwayStation[]>(),
		] as const;
		for (const request of busRequests) {
			vi.mocked(fetchNearbyStops).mockReturnValueOnce(request.promise);
		}
		for (const request of subwayRequests) {
			vi.mocked(fetchNearbySubwayStations).mockReturnValueOnce(request.promise);
		}

		render(<MapPreviewPage />);
		await settle(busRequests[0], [busA]);
		await settle(subwayRequests[0], []);
		fireEvent.click(screen.getByRole("button", { name: "지도 첫 지점 선택" }));
		expect(screen.getByLabelText("지도 활성 지점")).toHaveTextContent("bus:bus-a");

		fireEvent.click(screen.getByRole("button", { name: "지도 중심 이동" }));
		await settle(busRequests[1], []);
		await settle(subwayRequests[1], []);
		expect(screen.getByLabelText("지도 활성 지점")).toHaveTextContent("없음");

		fireEvent.click(screen.getByRole("button", { name: "지도 중심 다시 이동" }));
		await settle(busRequests[2], [busA]);
		await settle(subwayRequests[2], []);

		expect(screen.getByLabelText("지도 활성 지점")).toHaveTextContent("없음");
		expect(screen.getByRole("button", { name: /버스 천호역 정류장/ })).toHaveAttribute(
			"aria-pressed",
			"false",
		);
	});

	it("explains simultaneous catalog failures and keeps the return path", async () => {
		const busRequest = deferred<BusStop[]>();
		const subwayRequest = deferred<SubwayStation[]>();
		vi.mocked(fetchNearbyStops).mockReturnValue(busRequest.promise);
		vi.mocked(fetchNearbySubwayStations).mockReturnValue(subwayRequest.promise);

		render(<MapPreviewPage />);
		await fail(busRequest, new Error("bus"));
		await fail(subwayRequest, new Error("subway"));

		expect(screen.getByRole("alert", { name: "버스 정류장 오류" })).toBeVisible();
		expect(screen.getByRole("alert", { name: "지하철역 오류" })).toBeVisible();
		expect(screen.getByRole("link", { name: /모타로 돌아가기/ })).toHaveAttribute(
			"href",
			"/",
		);
	});

	it("keeps the map usable with a non-blocking resource alert", async () => {
		render(<MapPreviewPage />);
		fireEvent.click(screen.getByRole("button", { name: "지도 준비 완료" }));
		expect(screen.getByRole("status", { name: "3D 지도 상태" })).toHaveTextContent(
			/준비됐/,
		);

		fireEvent.click(screen.getByRole("button", { name: "지도 리소스 실패" }));

		expect(screen.getByRole("alert", { name: "3D 지도 일부 오류" })).toHaveTextContent(
			/계속 사용할 수/,
		);
		expect(screen.getByRole("region", { name: "지도 테스트 표면" })).toBeVisible();
		expect(screen.getByRole("link", { name: /모타로 돌아가기/ })).toBeVisible();
	});

	it.each([
		["construction", /시작할 수 없/],
		["style", /스타일을 불러오지 못/],
		["missing-building-layer", /3D 건물 정보를 확인할 수 없/],
		["webgl-context-lost", /3D 지도 연결이 중단/],
	] satisfies readonly [MapPreviewFatal["kind"], RegExp][]) (
		"turns %s into an escapable fatal state",
		async (kind, expectedMessage) => {
			render(<MapPreviewPage />);
			fireEvent.click(screen.getByRole("button", { name: `${kind} 실패` }));

			const alert = screen.getByRole("alert", { name: "3D 지도 치명적 오류" });
			expect(alert).toHaveTextContent(expectedMessage);
			expect(screen.queryByRole("region", { name: "지도 테스트 표면" })).toBeNull();
			expect(screen.getByRole("link", { name: /모타로 돌아가기/ })).toHaveAttribute(
				"href",
				"/",
			);
		},
	);

	it("does not access unrelated network or persistence surfaces", async () => {
		const fetchSpy = vi.spyOn(globalThis, "fetch");
		const storageWriteSpy = vi.spyOn(Storage.prototype, "setItem");

		render(<MapPreviewPage />);

		await waitFor(() => {
			expect(screen.getByText(/근처에 버스 정류장이 없/)).toBeVisible();
			expect(screen.getByText(/근처에 지하철역이 없/)).toBeVisible();
		});
		expect(fetchNearbyStops).toHaveBeenCalledOnce();
		expect(fetchNearbySubwayStations).toHaveBeenCalledOnce();
		expect(fetchSpy).not.toHaveBeenCalled();
		expect(storageWriteSpy).not.toHaveBeenCalled();
		fetchSpy.mockRestore();
		storageWriteSpy.mockRestore();
	});
});
