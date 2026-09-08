/**
 * Train LOD regression coverage for /3d-preview.
 *
 * Deterministic fixture data only (no live API, no raster tiles): two crossing
 * subway lines carry their authoritative line colors, and trains are anchored
 * at the initial camera center so zoom gestures keep them framed at every
 * level of detail. Camera settles are awaited by subscribing to the map
 * container's `data-zoom` attribute (written by the app on every moveend)
 * BEFORE the gesture is triggered, so synchronization never depends on fixed
 * sleeps or poll timing. Screenshots land in this spec's test output for
 * human visual inspection; assertions carry the regression contract.
 */
import type { SubwayVehicle, TransitMapNetwork } from "@mota/contracts/transit-map";
import { expect, type Page, test } from "@playwright/test";
import {
	MAP_PREVIEW_INITIAL_CAMERA,
	MAP_PREVIEW_TRAIN_LOD_SWITCH_ZOOM,
	MAP_PREVIEW_ZOOM_LIMITS,
} from "../src/components/map-preview/mapPreviewConfig";
import { installPreviewFixtures, localBuildingStyle } from "./fixtures/mapPreviewFixtures";

const CENTER: [number, number] = [...MAP_PREVIEW_INITIAL_CAMERA.center];

// Two authoritative Seoul line colors on two crossing fixture routes.
const twoLineNetwork = ((): TransitMapNetwork => ({
	revision: "lod-fixture",
	generatedAt: "2026-09-05T04:20:00.000Z",
	subway: {
		attribution: "© OpenStreetMap contributors, ODbL",
		lines: {
			type: "FeatureCollection",
			features: [
				{
					type: "Feature",
					properties: { routeId: "8", routeName: "8호선", color: "#e6186c" },
					geometry: {
						type: "LineString",
						coordinates: [
							[127.118, 37.532],
							[127.123, 37.538],
							[127.13, 37.542],
						],
					},
				},
				{
					type: "Feature",
					properties: { routeId: "5", routeName: "5호선", color: "#996cac" },
					geometry: {
						type: "LineString",
						coordinates: [
							[127.115, 37.5335],
							[127.133, 37.539],
						],
					},
				},
			],
		},
		stations: {
			type: "FeatureCollection",
			features: [
				{
					type: "Feature",
					properties: {
						stationId: "8120",
						stationName: "천호역 (풍납토성)",
						routeIds: ["5호선", "8호선"],
					},
					geometry: { type: "Point", coordinates: [127.123, 37.538] },
				},
			],
		},
	},
}))();

const lineEightTrain: SubwayVehicle = {
	id: "subway:8:8120",
	mode: "subway",
	routeId: "8",
	routeName: "8호선",
	coordinates: CENTER,
	bearing: 54,
	direction: "암사행",
	capturedAt: "2026-09-05T04:20:00.000Z",
	positionBasis: "station-segment",
};

const lineFiveTrain: SubwayVehicle = {
	id: "subway:5:5511",
	mode: "subway",
	routeId: "5",
	routeName: "5호선",
	coordinates: [CENTER[0] + 0.0006, CENTER[1] - 0.0004],
	bearing: 87,
	direction: "방화행",
	capturedAt: "2026-09-05T04:20:00.000Z",
	positionBasis: "station-segment",
};

/** The deterministic building fixture translated northwest so the centered
 * trains are never occluded by the 48m block at near zoom. */
const openStyle = JSON.parse(JSON.stringify(localBuildingStyle)) as typeof localBuildingStyle;
{
	const ring = openStyle.sources.openmaptiles.data.features[0].geometry.coordinates[0] as [
		number,
		number,
	][];
	for (const point of ring) {
		point[0] -= 0.004;
		point[1] += 0.0028;
	}
}

async function openPreview(page: Page) {
	await installPreviewFixtures(page, {
		style: openStyle,
		onNetwork: (route) => route.fulfill({ json: twoLineNetwork }),
	});
	await page.goto("/3d-preview", { waitUntil: "domcontentloaded" });
	const map = page.getByTestId("maplibre-preview-map");
	await expect(map).toHaveAttribute("data-map-ready", "true");
	// The initial fake stream snapshot must be displayed before any gesture.
	await expect(map).toHaveAttribute("data-subway-vehicles", "1");
	return map;
}

async function emitTrains(page: Page, subway: SubwayVehicle[], capturedAt: string) {
	await page.evaluate((payload) => window.__motaTransitFixture.emit("vehicles", payload), {
		kind: "vehicles",
		subway,
		capturedAt,
	});
}

/** Re-assert the fixture trains after a camera settle: every settle reopens
 * the fake stream, which replays the latest vehicles snapshot on its own. */
async function holdTrains(page: Page, subway: SubwayVehicle[], capturedAt: string) {
	const map = page.getByTestId("maplibre-preview-map");
	await emitTrains(page, subway, capturedAt);
	await expect(map).toHaveAttribute(
		"data-subway-vehicle-position",
		subway[0].coordinates.join(","),
	);
}

async function zoomOf(page: Page) {
	return Number(await page.getByTestId("maplibre-preview-map").getAttribute("data-zoom"));
}

async function lodOf(page: Page) {
	return page.getByTestId("maplibre-preview-map").getAttribute("data-subway-vehicle-lod");
}

/** Subscribe, then trigger, then await the exact settle event: resolves with
 * the first `data-zoom` value the map writes after subscription. The app
 * writes that attribute in its moveend handler only, so resolution means the
 * gesture fully settled. Bounded: rejects if the camera never settles. */
function zoomSettle(page: Page) {
	return page.evaluate(
		() =>
			new Promise<number>((resolve, reject) => {
				const el = document.querySelector('[data-testid="maplibre-preview-map"]');
				if (!el) {
					reject(new Error("map container missing"));
					return;
				}
				const previous = el.getAttribute("data-zoom");
				const timer = setTimeout(() => {
					observer.disconnect();
					reject(new Error("camera settle event did not arrive"));
				}, 8000);
				const observer = new MutationObserver(() => {
					const value = el.getAttribute("data-zoom");
					if (value === null || value === previous) return;
					clearTimeout(timer);
					observer.disconnect();
					resolve(Number(value));
				});
				observer.observe(el, { attributes: true, attributeFilter: ["data-zoom"] });
			}),
	);
}

async function cameraGesture(page: Page, trigger: () => Promise<void>) {
	const settled = zoomSettle(page);
	await trigger();
	return settled;
}

/** Wheel-zoom toward a target zoom. MapLibre scales wheel input
 * logarithmically, so magnitude is heuristic; convergence is driven by the
 * settle events the map itself emits, one gesture at a time. The pointer
 * stays at the canvas center so the centered trains stay framed. */
async function wheelZoomTo(page: Page, target: number) {
	const map = page.getByTestId("maplibre-preview-map");
	const box = await map.boundingBox();
	if (!box) throw new Error("map missing");
	const cx = box.x + box.width / 2;
	const cy = box.y + box.height / 2;
	let zoom = await zoomOf(page);
	for (let guard = 0; guard < 60; guard++) {
		const remaining = target - zoom;
		if (Math.abs(remaining) < 0.03) return zoom;
		const magnitude = Math.min(120, Math.max(6, Math.abs(remaining) * 450));
		zoom = await cameraGesture(page, async () => {
			await page.mouse.move(cx, cy);
			await page.mouse.wheel(0, -Math.sign(remaining) * magnitude);
		});
	}
	throw new Error(`wheel zoom toward ${target} did not settle (at ${zoom})`);
}

async function zoomButtonTo(page: Page, name: "확대" | "축소", target: number) {
	const map = page.getByTestId("maplibre-preview-map");
	let zoom = await zoomOf(page);
	const reached = () =>
		name === "확대" ? zoom >= target - 0.001 : zoom <= target + 0.001;
	for (let guard = 0; guard < 8 && !reached(); guard++) {
		zoom = await cameraGesture(page, () => map.getByRole("button", { name }).click());
	}
	return zoom;
}

async function shot(page: Page, name: string) {
	await page.getByTestId("maplibre-preview-map").screenshot({
		path: test.info().outputPath(`${name}.png`),
	});
}

test.describe.serial("train LOD", () => {
	test("far circles carry each line color and stay readable down to the zoom floor", async ({
		page,
	}) => {
		const map = await openPreview(page);
		await emitTrains(page, [lineEightTrain, lineFiveTrain], "2026-09-05T04:20:10.000Z");
		await expect(map).toHaveAttribute("data-subway-vehicles", "2");
		await expect(await lodOf(page)).toBe("far-circle");
		await shot(page, "train-lod-far-two-lines");

		// Zoom out to the floor; the circle must not shrink away.
		const floor = await zoomButtonTo(
			page,
			"축소",
			MAP_PREVIEW_ZOOM_LIMITS.min,
		);
		expect(floor).toBe(MAP_PREVIEW_ZOOM_LIMITS.min);
		await holdTrains(page, [lineEightTrain, lineFiveTrain], "2026-09-05T04:20:10.000Z");
		await expect(await lodOf(page)).toBe("far-circle");
		await shot(page, "train-lod-far-zoom-floor");
	});

	test("switches train detail exactly once at the LOD switch zoom", async ({ page }) => {
		await openPreview(page);
		await emitTrains(page, [lineEightTrain], "2026-09-05T04:20:10.000Z");

		const switchZoom = MAP_PREVIEW_TRAIN_LOD_SWITCH_ZOOM;
		const samples: Array<[number, string | null]> = [];
		const shots = new Map<number, string>([
			[switchZoom - 0.05, "train-lod-transition-below"],
			[switchZoom, "train-lod-transition-at"],
			[switchZoom + 0.05, "train-lod-transition-above"],
		]);
		for (const offset of [-0.3, -0.05, 0, 0.05, 0.3, 0.6]) {
			const zoom = await wheelZoomTo(page, switchZoom + offset);
			await holdTrains(page, [lineEightTrain], "2026-09-05T04:20:10.000Z");
			samples.push([zoom, await lodOf(page)]);
			const label = shots.get(switchZoom + offset);
			if (label) await shot(page, label);
		}

		// Exactly one representation switch across the sweep, at the boundary.
		const flips = samples.slice(1).filter((sample, index) => sample[1] !== samples[index][1]);
		expect(flips).toHaveLength(1);
		expect(
			samples.filter(([zoom]) => zoom < switchZoom).every(([, lod]) => lod === "far-circle"),
		).toBe(true);
		expect(
			samples.filter(([zoom]) => zoom >= switchZoom).every(([, lod]) => lod === "near-model"),
		).toBe(true);
		expect(flips[0]?.[0]).toBeGreaterThanOrEqual(switchZoom);
	});

	test("near model renders as a multi-car train from the switch zoom up", async ({ page }) => {
		const map = await openPreview(page);
		await emitTrains(page, [lineEightTrain, lineFiveTrain], "2026-09-05T04:20:10.000Z");
		await expect(map).toHaveAttribute("data-subway-vehicles", "2");

		const detailZooms: Array<[number, string]> = [
			[MAP_PREVIEW_TRAIN_LOD_SWITCH_ZOOM, "train-lod-near-switch"],
			[MAP_PREVIEW_TRAIN_LOD_SWITCH_ZOOM + 1, "train-lod-near-plus-1"],
			[MAP_PREVIEW_TRAIN_LOD_SWITCH_ZOOM + 2, "train-lod-near-plus-2"],
		];
		for (const [zoomTarget, label] of detailZooms) {
			const zoom = await zoomButtonTo(page, "확대", zoomTarget);
			expect(zoom).toBeGreaterThanOrEqual(zoomTarget - 0.001);
			await holdTrains(page, [lineEightTrain, lineFiveTrain], "2026-09-05T04:20:10.000Z");
			await expect(await lodOf(page)).toBe("near-model");
			await expect(map).toHaveAttribute("data-subway-vehicles", "2");
			await shot(page, label);
		}
	});

	test("selects trains at both LODs and the toggle clears the near model", async ({ page }) => {
		const map = await openPreview(page);
		await emitTrains(page, [lineEightTrain], "2026-09-05T04:20:10.000Z");

		// Far LOD selection: the circle sits at screen center.
		const box = await map.boundingBox();
		if (!box) throw new Error("map missing");
		await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
		await expect(page.getByRole("region", { name: "선택한 지점" })).toContainText("8호선");
		await expect(map.locator(".maplibregl-popup")).toContainText("8호선");
		await shot(page, "train-lod-selection-far");
		await map.locator(".maplibregl-popup-close-button").click();
		await expect(page.getByRole("region", { name: "선택한 지점" })).toContainText(
			"지도나 아래 목록",
		);

		// Near LOD selection on the extrusion model.
		const zoom = await zoomButtonTo(page, "확대", MAP_PREVIEW_TRAIN_LOD_SWITCH_ZOOM + 1);
		expect(zoom).toBeGreaterThanOrEqual(MAP_PREVIEW_TRAIN_LOD_SWITCH_ZOOM);
		await holdTrains(page, [lineEightTrain], "2026-09-05T04:20:10.000Z");
		await expect(await lodOf(page)).toBe("near-model");
		await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2 - 6);
		await expect(page.getByRole("region", { name: "선택한 지점" })).toContainText("8호선");
		await shot(page, "train-lod-selection-near");

		// Toggle teardown at near LOD.
		await page.getByRole("button", { name: "지하철 표시" }).click();
		await expect(map).toHaveAttribute("data-subway-vehicles", "0");
		await shot(page, "train-lod-toggle-off-near");
	});

	test("mobile viewport renders both LODs", async ({ page }) => {
		await page.setViewportSize({ width: 360, height: 800 });
		const map = await openPreview(page);
		await emitTrains(page, [lineEightTrain, lineFiveTrain], "2026-09-05T04:20:10.000Z");
		await expect(map).toHaveAttribute("data-subway-vehicles", "2");
		await expect(await lodOf(page)).toBe("far-circle");
		await shot(page, "train-lod-mobile-far");

		const zoom = await zoomButtonTo(page, "확대", MAP_PREVIEW_TRAIN_LOD_SWITCH_ZOOM + 1);
		expect(zoom).toBeGreaterThanOrEqual(MAP_PREVIEW_TRAIN_LOD_SWITCH_ZOOM);
		await holdTrains(page, [lineEightTrain, lineFiveTrain], "2026-09-05T04:20:10.000Z");
		await expect(await lodOf(page)).toBe("near-model");
		await shot(page, "train-lod-mobile-near");
	});

	test("reduced motion jumps the near model without interpolation", async ({ page }) => {
		await page.emulateMedia({ reducedMotion: "reduce" });
		const map = await openPreview(page);
		const zoom = await zoomButtonTo(page, "확대", MAP_PREVIEW_TRAIN_LOD_SWITCH_ZOOM);
		expect(zoom).toBeGreaterThanOrEqual(MAP_PREVIEW_TRAIN_LOD_SWITCH_ZOOM);
		await holdTrains(page, [lineEightTrain], "2026-09-05T04:20:10.000Z");
		await expect(await lodOf(page)).toBe("near-model");
		const moved: SubwayVehicle = {
			...lineEightTrain,
			coordinates: [CENTER[0] + 0.0002, CENTER[1] + 0.00016],
			bearing: 60,
			capturedAt: "2026-09-05T04:20:30.000Z",
		};
		await emitTrains(page, [moved], "2026-09-05T04:20:30.000Z");
		// Reduced motion skips the 800ms interpolation: the displayed position
		// is the new observation immediately.
		await expect(map).toHaveAttribute(
			"data-subway-vehicle-position",
			moved.coordinates.join(","),
		);
	});
});
