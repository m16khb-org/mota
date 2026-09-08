import { useCallback, useMemo, useRef, useState } from "react";
import type {
	TransitAvailability,
	SubwayVehicle,
	TransitMapNetwork,
} from "@mota/contracts/transit-map";
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

type LiveConnection = ReturnType<typeof useLiveTransitMap>["connection"];

type VehicleDisplayState =
	| { readonly kind: "live"; readonly count: number }
	| { readonly kind: "connecting" }
	| { readonly kind: "reconnecting" }
	| { readonly kind: "error" }
	| { readonly kind: "no-service" }
	| { readonly kind: "unavailable" }
	| { readonly kind: "unconfigured" }
	| { readonly kind: "zoom-required" };

// Only a live stream carrying server availability states an authoritative
// vehicle count; every other connection phase must say so instead of "0대".
function vehicleDisplayState(
	connection: LiveConnection,
	availability: TransitAvailability,
	count: number,
): VehicleDisplayState {
	if (connection === "loading" || connection === "connecting") {
		return { kind: "connecting" };
	}
	if (connection === "reconnecting") return { kind: "reconnecting" };
	if (connection === "error") return { kind: "error" };
	if (availability === "live") return { kind: "live", count };
	if (availability === "no-service") return { kind: "no-service" };
	return { kind: availability };
}

function vehicleDisplayCopy(status: VehicleDisplayState): string {
	switch (status.kind) {
		case "live":
			return `현재 화면 ${status.count}대 운행 중`;
		case "no-service":
			return "현재 화면 0대 운행 중";
		case "connecting":
			return "운행 정보 확인 중";
		case "reconnecting":
			return "재연결 중";
		case "error":
		case "unavailable":
			return "정보 없음";
		case "unconfigured":
			return "설정 필요";
		case "zoom-required":
			return "확대 필요";
	}
}

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
				const button = [
					...(listRef.current?.querySelectorAll<HTMLButtonElement>("button") ?? []),
				].find(
					(candidate) => candidate.dataset.selectionKey === previousSelection.key,
				);
				button?.focus();
			});
		},
		[selection],
	);

	const visibleNetwork = useMemo(
		() => filterNetwork(live.network, showSubway),
		[live.network, showSubway],
	);
	const visibleVehicles = useMemo(
		() =>
			showSubway
				? live.vehicles.filter(
						(vehicle): vehicle is SubwayVehicle => vehicle.mode === "subway",
					)
				: [],
		[live.vehicles, showSubway],
	);
	const listSelections = useMemo(
		() => buildListSelections(visibleNetwork, visibleVehicles),
		[visibleNetwork, visibleVehicles],
	);
	const visibleVehicleCount = useMemo(
		() => countVehiclesInViewport(live.vehicles, viewport),
		[live.vehicles, viewport],
	);
	const subwayStatus = vehicleDisplayState(
		live.connection,
		live.availability,
		visibleVehicleCount,
	);

	return (
		<main className="map-preview-page">
			<aside className="map-preview-rail" aria-label="실시간 지하철 제어판">
				<header className="map-preview-header">
					<a className="map-preview-back-link" href="/">
						모타로 돌아가기
					</a>
					<p className="map-preview-eyebrow">SEOUL SUBWAY / LIVE</p>
					<h1>서울 실시간 3D 지도</h1>
					<p className="map-preview-intro">
						도시 아래를 움직이는 지하철을 조용히 바라보세요.
					</p>
					<p className="map-preview-intro">
						역과 차량은 관측된 역을 기준으로 표시하며 역 사이 이동은 추정 보간합니다.
					</p>
				</header>

				<section className="map-preview-live" aria-labelledby="live-status-title">
					<h2 id="live-status-title" className="sr-only">
						실시간 운행 상태
					</h2>
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
							status={subwayStatus}
							onClick={() => setShowSubway((shown) => !shown)}
						/>
					</fieldset>
					<div className="map-preview-mode-notices">
						{availabilityCopy(subwayStatus)}
					</div>
				</section>

				<section className="map-preview-viewport" aria-label="현재 화면 요약">
					<div>
						<span>확대</span>
						<strong>{viewport.zoom.toFixed(1)}</strong>
					</div>
					<div>
						<span>지하철역</span>
						<strong>{live.network?.subway.stations.features.length ?? 0}</strong>
					</div>
				</section>

				<section className="map-preview-selection" aria-label="선택한 지점">
					<p className="map-preview-section-label">SELECTED</p>
					{selection ? (
						<>
							<h2>{selection.name}</h2>
							<p>{selection.detail || selection.kind}</p>
						</>
					) : (
						<p>지도나 아래 목록에서 역과 차량을 선택하세요.</p>
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
				<h2 id="map-preview-map-title" className="sr-only">
					서울 실시간 3D 지도
				</h2>
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
	status,
	onClick,
}: {
	readonly label: "지하철";
	readonly pressed: boolean;
	readonly status: VehicleDisplayState;
	readonly onClick: () => void;
}) {
	return (
		<button
			type="button"
			className="map-preview-mode"
			aria-label={`${label} 표시`}
			aria-pressed={pressed}
			data-vehicle-state={status.kind}
			onClick={onClick}
		>
			<span>{label}</span>
			<strong>{vehicleDisplayCopy(status)}</strong>
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

function availabilityCopy(status: VehicleDisplayState) {
	if (
		status.kind === "live" ||
		status.kind === "connecting" ||
		status.kind === "reconnecting" ||
		status.kind === "error"
	) {
		return null;
	}
	const copy = {
		"no-service": "지하철 운행 정보 없음",
		unavailable: "지하철 실시간 정보를 불러오지 못했습니다",
		unconfigured: "지하철 API 설정이 필요합니다",
		"zoom-required": "더 확대하면 지하철 정보를 표시합니다",
	} as const;
	return <p>{copy[status.kind]}</p>;
}

function filterNetwork(
	network: TransitMapNetwork | null,
	showSubway: boolean,
): TransitMapNetwork | null {
	if (!network) return null;
	return showSubway
		? network
		: {
				...network,
				subway: {
					...network.subway,
					lines: EMPTY_COLLECTION,
					stations: EMPTY_COLLECTION,
				},
			};
}

function countVehiclesInViewport(
	vehicles: readonly SubwayVehicle[],
	viewport: MapViewport,
) {
	return vehicles.filter((vehicle) => {
		const [longitude, latitude] = vehicle.coordinates;
		return (
			longitude >= viewport.west &&
			longitude <= viewport.east &&
			latitude >= viewport.south &&
			latitude <= viewport.north
		);
	}).length;
}

function buildListSelections(
	network: TransitMapNetwork | null,
	vehicles: readonly SubwayVehicle[],
) {
	if (!network) return [];
	const stations: TransitMapSelection[] = network.subway.stations.features.map(
		(feature) => ({
			key: feature.properties.stationId,
			mode: "subway",
			kind: "station",
			name: feature.properties.stationName,
			detail: feature.properties.routeIds.join(" · "),
			coordinates: feature.geometry.coordinates,
		}),
	);
	const moving: TransitMapSelection[] = vehicles.map((vehicle) => ({
		key: vehicle.id,
		mode: "subway" as const,
		kind: "vehicle" as const,
		name: vehicle.routeName,
		detail: vehicle.direction,
		coordinates: vehicle.coordinates,
	}));
	return [...moving, ...stations];
}
