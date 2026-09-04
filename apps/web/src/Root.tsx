import { lazy, Suspense } from "react";
import { App } from "./App";

const MapPreviewPage = lazy(() => import("./components/map-preview/MapPreviewPage").then(({ MapPreviewPage }) => ({ default: MapPreviewPage })));

export function Root() {
	if (window.location.pathname !== "/3d-preview") return <App />;
	return (
		<Suspense
			fallback={
				<div className="map-preview-route-fallback">
					<a href="/">모타로 돌아가기</a>
					<p role="status">3D 지도 미리보기를 불러오는 중이에요.</p>
				</div>
			}
		>
			<MapPreviewPage />
		</Suspense>
	);
}
