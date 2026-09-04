import { useCallback, useMemo, useRef, useState } from "react";
import type { TransitMapNetwork, TransitVehicle } from "@mota/contracts/transit-map";
import "maplibre-gl/dist/maplibre-gl.css";
import type { MapViewport } from "../../api/transitMapClient";
import { MAP_PREVIEW_INITIAL_CAMERA } from "./mapPreviewConfig";
import {
	MapLibrePreviewMap,
	type MapPreviewDegraded,
	type MapPreviewFatal,
} from "./MapLibrePreviewMap";
import type { TransitMapSelection } from "./transitMapLayers";
import { useLiveTransitMap } from "./useLiveTransitMap";
import "./MapPreviewPage.css";

const INITIAL_VIEWPORT: MapViewport = {
	west: MAP_PREVIEW_INITIAL_CAMERA.center[0] - 0.01,
	south: MAP_PREVIEW_INITIAL_CAMERA.center[1] - 0.01,
	east: MAP_PREVIEW_INITIAL_CAMERA.center[0] + 0.01,
	north: MAP_PREVIEW_INITIAL_CAMERA.center[1] + 0.01,
	zoom: MAP_PREVIEW_INITIAL_CAMERA.zoom,
};

const EMPTY_COLLECTION = { type: "FeatureCollection" as const, features: [] };

function fatalMessage(failure: MapPreviewFatal) {
	switch (failure.kind) {
		case "construction":
			return "이 브라우저에서 3D 지도를 시작할 수 없습니다.";
		case "style":
			return "3D 지도 스타일을 불러오지 못했습니다.";
		case "missing-building-layer":
			return "3D 건물 정보를 확인할 수 없습니다.";
		case "webgl-context-lost":
			return "3D 지도 연결이 중단됐습니다.";
	}
}

export function MapPreviewPage() {
	const [viewport, setViewport] = useState(INITIAL_VIEWPORT);
	const [mapReady, setMapReady] = useState(false);
	const [fatal, setFatal] = useState<MapPreviewFatal | null>(null);
	const [degraded, setDegraded] = useState<MapPreviewDegraded | null>(null);
	const [showSubway, setShowSubway] = useState(true);
	const [showBus, setShowBus] = useState(true);
	const [selection, setSelection] = useState<TransitMapSelection | null>(null);
	const listRef = useRef<HTMLDetailsElement>(null);
	const selectionOriginRef = useRef<"list" | "map" | null>(null);
	const live = useLiveTransitMap(viewport);
	const handleMapSelection = useCallback(
		(nextSelection: TransitMapSelection | null) => {
			const previousSelection = selection;
			setSelection(nextSelection);
			if (nextSelection) {
				selectionOriginRef.current = "map";
				return;
			}
			if (!previousSelection || selectionOriginRef.current !== "list") return;
			queueMicrotask(() => {
				const button = [...(listRef.current?.querySelectorAll<HTMLButtonElement>("button") ?? [])]
					.find((candidate) => candidate.dataset.selectionKey === previousSelection.key);
				button?.focus();
			});
		},
		[selection],
	);

	const visibleNetwork = useMemo(
		() => filterNetwork(live.network, showSubway, showBus),
		[live.network, showSubway, showBus],
	);
	const visibleVehicles = useMemo(
		() => ({
			bus: showBus ? live.vehicles.bus : [],
			subway: showSubway ? live.vehicles.subway : [],
		}),
		[live.vehicles, showBus, showSubway],
	);
	const listSelections = useMemo(
		() => buildListSelections(visibleNetwork, visibleVehicles),
		[visibleNetwork, visibleVehicles],
	);

	return (
		<main className="map-preview-page">
			<aside className="map-preview-rail" aria-label="실시간 대중교통 제어판">
				<header className="map-preview-header">
					<a className="map-preview-back-link" href="/">
						모타로 돌아가기
					</a>
					<p className="map-preview-eyebrow">SEOUL TRANSIT / LIVE</p>
					<h1>서울 실시간 3D 지도</h1>
					<p className="map-preview-intro">
						도시 위를 움직이는 지하철과 버스를 조용히 바라보세요.
					</p>
					<p className="map-preview-intro">역·정류장·차량은 실제 위치를 표시하는 간략한 입체 모형입니다.</p>
				</header>

				<section className="map-preview-live" aria-labelledby="live-status-title">
					<h2 id="live-status-title" className="sr-only">실시간 운행 상태</h2>
					<p
						className={`map-preview-live__status is-${live.connection}`}
						role="status"
						aria-label="실시간 운행 상태"
						aria-live="polite"
					>
						<span aria-hidden="true" />
						{connectionCopy(live.connection, live.lastServerTime)}
					</p>
					<fieldset className="map-preview-mode-grid">
						<legend className="sr-only">지도 표시 모드</legend>
						<ModeToggle
							label="지하철"
							pressed={showSubway}
							count={live.vehicles.subway.length}
							onClick={() => setShowSubway((shown) => !shown)}
						/>
						<ModeToggle
							label="버스"
							pressed={showBus}
							count={live.vehicles.bus.length}
							onClick={() => setShowBus((shown) => !shown)}
						/>
					</fieldset>
					<div className="map-preview-mode-notices">
						{availabilityCopy("subway", live.availability.subway)}
						{availabilityCopy("bus", live.availability.bus)}
					</div>
				</section>

				<section className="map-preview-viewport" aria-label="현재 화면 요약">
					<div><span>확대</span><strong>{viewport.zoom.toFixed(1)}</strong></div>
					<div><span>지하철역</span><strong>{live.network?.subway.stations.features.length ?? 0}</strong></div>
					<div><span>버스 정류장</span><strong>{live.network?.bus.stops.features.length ?? 0}</strong></div>
				</section>

				<section className="map-preview-selection" aria-label="선택한 지점">
					<p className="map-preview-section-label">SELECTED</p>
					{selection ? (
						<>
							<h2>{selection.name}</h2>
							<p>{selection.detail || selection.kind}</p>
						</>
					) : (
						<p>지도나 아래 목록에서 역, 정류장, 차량을 선택하세요.</p>
					)}
				</section>

				<details ref={listRef} className="map-preview-point-list">
					<summary>전체 지점 목록 ({listSelections.length})</summary>
					{listSelections.length === 0 ? (
						<p>현재 화면에 표시할 지점이 없습니다.</p>
					) : (
						<ul>
							{listSelections.map((item) => (
								<li key={`${item.kind}:${item.key}`}>
									<button
										type="button"
										aria-pressed={selection?.key === item.key}
										data-selection-key={item.key}
										onClick={() => {
											selectionOriginRef.current = "list";
											setSelection(item);
										}}
									>
										<strong>{item.name}</strong>
										<span>{item.detail}</span>
									</button>
								</li>
							))}
						</ul>
					)}
				</details>
			</aside>

			<section className="map-preview-map" aria-labelledby="map-preview-map-title">
				<h2 id="map-preview-map-title" className="sr-only">서울 실시간 3D 지도</h2>
				<p className="map-preview-map__state" aria-hidden="true">
					{mapReady ? "3D 지도 준비 완료" : "3D 지도 준비 중"}
				</p>
				{degraded ? (
					<p role="alert" className="map-preview-map__alert">
						일부 지도 리소스를 불러오지 못했지만 운행 정보는 계속 표시합니다.
					</p>
				) : null}
				{fatal ? (
					<div role="alert" aria-label="3D 지도 치명적 오류">
						<h2>3D 지도를 표시할 수 없습니다.</h2>
						<p>{fatalMessage(fatal)}</p>
						<a href="/">모타로 돌아가기</a>
					</div>
				) : (
					<MapLibrePreviewMap
						onReady={() => setMapReady(true)}
						onViewportChange={setViewport}
						onFatal={setFatal}
						onDegraded={setDegraded}
						network={visibleNetwork}
						vehicles={visibleVehicles}
						selection={selection}
						onTransitSelect={handleMapSelection}
					/>
				)}
			</section>
		</main>
	);
}

function ModeToggle({
	label,
	pressed,
	count,
	onClick,
}: {
	readonly label: "버스" | "지하철";
	readonly pressed: boolean;
	readonly count: number;
	readonly onClick: () => void;
}) {
	return (
		<button
			type="button"
			className="map-preview-mode"
			aria-label={`${label} 표시`}
			aria-pressed={pressed}
			onClick={onClick}
		>
			<span>{label}</span>
			<strong>{count}대 운행 중</strong>
		</button>
	);
}

function connectionCopy(
	connection: ReturnType<typeof useLiveTransitMap>["connection"],
	serverTime: string | null,
) {
	if (connection === "live") {
		return `실시간 연결됨 · ${serverTime?.slice(11, 19) ?? "--:--:--"}`;
	}
	if (connection === "reconnecting") return "재연결 중 · 차량을 숨겼습니다";
	if (connection === "error") return "실시간 연결을 시작하지 못했습니다";
	return "실시간 운행 정보를 연결하고 있습니다";
}

function availabilityCopy(
	mode: "bus" | "subway",
	availability: ReturnType<typeof useLiveTransitMap>["availability"][typeof mode],
) {
	if (availability === "live") return null;
	const copy = {
		bus: {
			"no-service": "현재 화면에 운행 중인 버스가 없습니다",
			unavailable: "버스 실시간 정보를 불러오지 못했습니다",
			unconfigured: "버스 API 설정이 필요합니다",
			"zoom-required": "더 확대하면 현재 화면의 버스를 표시합니다",
		},
		subway: {
			"no-service": "지하철 운행 정보 없음",
			unavailable: "지하철 실시간 정보를 불러오지 못했습니다",
			unconfigured: "지하철 API 설정이 필요합니다",
			"zoom-required": "더 확대하면 지하철 정보를 표시합니다",
		},
	} as const;
	return <p key={mode}>{copy[mode][availability]}</p>;
}

function filterNetwork(
	network: TransitMapNetwork | null,
	showSubway: boolean,
	showBus: boolean,
): TransitMapNetwork | null {
	if (!network) return null;
	return {
		...network,
		subway: showSubway
			? network.subway
			: { ...network.subway, lines: EMPTY_COLLECTION, stations: EMPTY_COLLECTION },
		bus: showBus
			? network.bus
			: { ...network.bus, routes: EMPTY_COLLECTION, stops: EMPTY_COLLECTION },
	};
}

function buildListSelections(
	network: TransitMapNetwork | null,
	vehicles: { readonly bus: readonly TransitVehicle[]; readonly subway: readonly TransitVehicle[] },
) {
	if (!network) return [];
	const stations: TransitMapSelection[] = network.subway.stations.features.map((feature) => ({
		key: feature.properties.stationId,
		mode: "subway",
		kind: "station",
		name: feature.properties.stationName,
		detail: feature.properties.routeIds.join(" · "),
		coordinates: feature.geometry.coordinates,
	}));
	const stops: TransitMapSelection[] = network.bus.stops.features.map((feature) => ({
		key: feature.properties.stopId,
		mode: "bus",
		kind: "stop",
		name: feature.properties.stopName,
		detail: feature.properties.arsId ?? "ARS 정보 없음",
		coordinates: feature.geometry.coordinates,
	}));
	const moving: TransitMapSelection[] = [...vehicles.subway, ...vehicles.bus].map((vehicle) => ({
		key: vehicle.id,
		mode: vehicle.mode,
		kind: "vehicle",
		name: vehicle.routeName,
		detail: vehicle.direction,
		coordinates: vehicle.coordinates,
	}));
	return [...moving, ...stations, ...stops];
}
