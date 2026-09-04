import { useEffect, useMemo, useState } from "react";
import "maplibre-gl/dist/maplibre-gl.css";
import { MAP_PREVIEW_INITIAL_CAMERA } from "./mapPreviewConfig";
import {
	MapLibrePreviewMap,
	type MapPreviewDegraded,
	type MapPreviewFatal,
} from "./MapLibrePreviewMap";
import { mapPreviewPoints } from "./mapPreviewPoints";
import type { MapPreviewPointKey } from "./previewMarkers";
import {
	type PreviewCatalogStatus,
	type PreviewCenter,
	usePreviewNearbyPoints,
} from "./usePreviewNearbyPoints";
import "./MapPreviewPage.css";

const INITIAL_CENTER: PreviewCenter = {
	lat: MAP_PREVIEW_INITIAL_CAMERA.center[1],
	lng: MAP_PREVIEW_INITIAL_CAMERA.center[0],
};

interface CatalogStatusProps {
	readonly count: number;
	readonly emptyMessage: string;
	readonly errorLabel: string;
	readonly errorMessage: string;
	readonly label: string;
	readonly loadingMessage: string;
	readonly onRetry: () => void;
	readonly retryLabel: string;
	readonly status: PreviewCatalogStatus;
}

function CatalogStatus({
	count,
	emptyMessage,
	errorLabel,
	errorMessage,
	label,
	loadingMessage,
	onRetry,
	retryLabel,
	status,
}: CatalogStatusProps) {
	return (
		<section className="map-preview-catalog" aria-labelledby={`${errorLabel}-title`}>
			<div className="map-preview-catalog__heading">
				<h2 id={`${errorLabel}-title`}>{label}</h2>
				<output aria-label={`${label} 수`}>{count}곳</output>
			</div>
			{status === "loading" ? (
				<p role="status" aria-label={`${label} 상태`}>
					{loadingMessage}
				</p>
			) : null}
			{status === "empty" ? <p>{emptyMessage}</p> : null}
			{status === "error" ? (
				<div role="alert" aria-label={`${label} 오류`}>
					<p>{errorMessage}</p>
					<button type="button" onClick={onRetry}>
						{retryLabel}
					</button>
				</div>
			) : null}
		</section>
	);
}

function fatalMessage(failure: MapPreviewFatal) {
	switch (failure.kind) {
		case "construction":
			return "이 브라우저에서 3D 지도를 시작할 수 없어요.";
		case "style":
			return "3D 지도 스타일을 불러오지 못했어요.";
		case "missing-building-layer":
			return "3D 건물 정보를 확인할 수 없어요.";
		case "webgl-context-lost":
			return "3D 지도 연결이 중단됐어요.";
	}
}

export function MapPreviewPage() {
	const [center, setCenter] = useState<PreviewCenter>(INITIAL_CENTER);
	const [mapReady, setMapReady] = useState(false);
	const [fatal, setFatal] = useState<MapPreviewFatal | null>(null);
	const [degraded, setDegraded] = useState<MapPreviewDegraded | null>(null);
	const [activePointKey, setActivePointKey] =
		useState<MapPreviewPointKey | null>(null);
	const nearby = usePreviewNearbyPoints(center);
	const points = useMemo(
		() => mapPreviewPoints(nearby.bus.items, nearby.subway.items),
		[nearby.bus.items, nearby.subway.items],
	);
	const visibleActivePointKey =
		activePointKey !== null &&
		points.some((point) => point.key === activePointKey)
			? activePointKey
			: null;

	useEffect(() => {
		if (activePointKey !== null && visibleActivePointKey === null) {
			setActivePointKey(null);
		}
	}, [activePointKey, visibleActivePointKey]);

	return (
		<main className="map-preview-page">
			<header className="map-preview-header">
				<a className="map-preview-back-link" href="/">
					모타로 돌아가기
				</a>
				<p className="map-preview-eyebrow">실험용 미리보기</p>
				<h1>서울 3D 지도</h1>
				<p>
					건물 높이와 주변 버스 정류장·지하철역을 함께 살펴보세요.
				</p>
			</header>

			<section className="map-preview-map" aria-labelledby="map-preview-map-title">
				<h2 id="map-preview-map-title" className="sr-only">
					3D 지도
				</h2>
				{fatal === null ? (
					<>
						<p role="status" aria-label="3D 지도 상태">
							{mapReady
								? "3D 지도가 준비됐어요."
								: "3D 지도를 준비하고 있어요."}
						</p>
						{degraded === null ? null : (
							<p role="alert" aria-label="3D 지도 일부 오류">
								지도 일부 리소스를 불러오지 못했어요. 지도를 계속 사용할 수
								있습니다.
							</p>
						)}
						<MapLibrePreviewMap
							center={center}
							onReady={() => setMapReady(true)}
							onCenterChange={setCenter}
							onFatal={setFatal}
							onDegraded={setDegraded}
							points={points}
							activePointKey={visibleActivePointKey}
							onActivePointChange={setActivePointKey}
						/>
					</>
				) : (
					<div role="alert" aria-label="3D 지도 치명적 오류">
						<h2>3D 지도를 표시할 수 없어요.</h2>
						<p>{fatalMessage(fatal)}</p>
						<p>기존 모타 지도와 도착 정보는 계속 사용할 수 있습니다.</p>
					</div>
				)}
			</section>

			<aside className="map-preview-points" aria-label="주변 대중교통 지점">
				<CatalogStatus
					label="버스 정류장"
					count={nearby.bus.items.length}
					status={nearby.bus.status}
					loadingMessage="버스 정류장을 불러오는 중이에요."
					emptyMessage="근처에 버스 정류장이 없어요."
					errorLabel="map-preview-bus"
					errorMessage="버스 정류장을 불러오지 못했어요."
					retryLabel="버스 정류장 다시 시도"
					onRetry={nearby.bus.retry}
				/>
				<CatalogStatus
					label="지하철역"
					count={nearby.subway.items.length}
					status={nearby.subway.status}
					loadingMessage="지하철역을 불러오는 중이에요."
					emptyMessage="근처에 지하철역이 없어요."
					errorLabel="map-preview-subway"
					errorMessage="지하철역을 불러오지 못했어요."
					retryLabel="지하철역 다시 시도"
					onRetry={nearby.subway.retry}
				/>

				<details className="map-preview-point-list" open>
					<summary>주변 지점 목록 ({points.length}곳)</summary>
					{points.length === 0 ? (
						<p>표시할 주변 지점이 없어요.</p>
					) : (
						<ul>
							{points.map((point) => (
								<li key={point.key}>
									<button
										type="button"
										aria-label={point.accessibleName}
										aria-pressed={visibleActivePointKey === point.key}
										onClick={() => setActivePointKey(point.key)}
									>
										<strong>{point.name}</strong>
										<span>{point.detail}</span>
										<span>중심에서 {Math.round(point.distance)}m</span>
									</button>
								</li>
							))}
						</ul>
					)}
				</details>
			</aside>
		</main>
	);
}
