import { expect, test, type Page } from "@playwright/test";
import {
	busStop,
	firstBus,
	firstTrain,
	installPreviewFixtures,
	localBuildingStyle,
	movedTrain,
	type NetworkAudit,
	observeNetworkAudit,
	subwayStation,
} from "./fixtures/mapPreviewFixtures";

function expectCleanAudit(audit: NetworkAudit) {
	expect(audit.consoleErrors).toEqual([]);
	expect(audit.pageErrors).toEqual([]);
	expect(audit.requestFailures).toEqual([]);
}

async function readyMap(page: Page) {
	const map = page.getByTestId("maplibre-preview-map");
	await expect(map).toHaveAttribute("data-map-ready", "true");
	return map;
}

test("keeps the home route free of map resources and supports navigation history", async ({
	page,
}) => {
	const audit = observeNetworkAudit(page);
	const resources: string[] = [];
	page.on("request", (request) => resources.push(request.url()));
	const fixture = await installPreviewFixtures(page);

	await page.goto("/", { waitUntil: "domcontentloaded" });
	await expect(page.getByRole("link", { name: "3D 지도 미리보기" })).toBeVisible();
	expect(resources.some((url) => /MapPreviewPage|maplibre|openfreemap/i.test(url))).toBe(false);
	expect(fixture.networkRequests).toEqual([]);

	await page.getByRole("link", { name: "3D 지도 미리보기" }).click();
	await readyMap(page);
	await expect(page).toHaveURL(/\/3d-preview$/);
	await page.reload({ waitUntil: "domcontentloaded" });
	await readyMap(page);
	await page.goBack({ waitUntil: "domcontentloaded" });
	await expect(page).toHaveURL(/\/$/);

	expect(fixture.unexpectedExternalRequests).toEqual([]);
	expectCleanAudit(audit);
});

test("renders static subway layers, a live train, controls, and an accessible popup", async ({
	page,
}) => {
	const audit = observeNetworkAudit(page);
	const fixture = await installPreviewFixtures(page);
	await page.goto("/3d-preview", { waitUntil: "domcontentloaded" });
	const map = await readyMap(page);

	await expect(map).toHaveAttribute("data-building-layer", "building-3d");
	await expect(map).toHaveAttribute("data-subway-lines", "1");
	await expect(map).toHaveAttribute("data-subway-stations", "1");
	await expect(map).toHaveAttribute("data-subway-vehicles", "1");
	await expect(map).toHaveAttribute("data-bus-lines", "0");
	await expect(page.getByText("더 확대하면 현재 화면의 버스를 표시합니다")).toBeVisible();
	await expect(page.getByRole("status", { name: "실시간 운행 상태" })).toContainText(
		"실시간 연결됨",
	);
	await expect(map.locator("canvas.maplibregl-canvas")).toBeVisible();
	await expect(map.locator('a[href="https://openfreemap.org/"]')).toBeVisible();

	const mapBox = await page.locator(".map-preview-map").boundingBox();
	const canvasBox = await map.locator("canvas.maplibregl-canvas").boundingBox();
	if (!mapBox || !canvasBox) throw new Error("Map projection surface did not render");
	expect(canvasBox.x).toBeGreaterThanOrEqual(mapBox.x);
	expect(canvasBox.y).toBeGreaterThanOrEqual(mapBox.y);
	expect(canvasBox.x + canvasBox.width).toBeLessThanOrEqual(mapBox.x + mapBox.width + 1);
	expect(canvasBox.y + canvasBox.height).toBeLessThanOrEqual(mapBox.y + mapBox.height + 1);

	await page.getByText(/전체 지점 목록/).click();
	const stationButton = page.getByRole("button", {
		name: /천호역/,
	});
	await stationButton.click();
	await expect(page.getByRole("region", { name: "선택한 지점" })).toContainText(
		subwayStation.properties.stationName,
	);
	const popupClose = map.locator(".maplibregl-popup-close-button");
	await expect(popupClose).toBeFocused();
	await popupClose.click();
	await expect(stationButton).toBeFocused();
	await expect(page.getByRole("region", { name: "선택한 지점" })).toContainText(
		"지도나 아래 목록",
	);

	expect(fixture.unexpectedExternalRequests).toEqual([]);
	expectCleanAudit(audit);
});

test("enables viewport-scoped bus layers at zoom 16 without replacing the stream controls", async ({
	page,
}) => {
	const audit = observeNetworkAudit(page);
	const fixture = await installPreviewFixtures(page);
	await page.goto("/3d-preview", { waitUntil: "domcontentloaded" });
	const map = await readyMap(page);
	const beforeConnections = await fixture.connectionCount();

	await map.getByRole("button", { name: "확대" }).click();
	await expect(map).toHaveAttribute("data-zoom", "16.000");
	await expect(map).toHaveAttribute("data-bus-lines", "1");
	await expect(map).toHaveAttribute("data-bus-stops", "1");
	await expect(map).toHaveAttribute("data-bus-vehicles", "1");
	await expect(page.getByText(busStop.properties.stopName)).toBeAttached();
	expect(
		fixture.networkRequests.some(
			(url) => Number(url.searchParams.get("zoom")) >= 16,
		),
	).toBe(true);
	expect(await fixture.connectionCount()).toBeGreaterThan(beforeConnections);

	const busToggle = page.getByRole("button", { name: "버스 표시" });
	await busToggle.focus();
	await page.keyboard.press("Space");
	await expect(busToggle).toHaveAttribute("aria-pressed", "false");
	await expect(map).toHaveAttribute("data-bus-lines", "0");
	await expect(map).toHaveAttribute("data-bus-vehicles", "0");

	expect(fixture.unexpectedExternalRequests).toEqual([]);
	expectCleanAudit(audit);
});

test("replaces live snapshots, clears a failed mode, and preserves its static network", async ({
	page,
}) => {
	const audit = observeNetworkAudit(page);
	const fixture = await installPreviewFixtures(page);
	await page.goto("/3d-preview", { waitUntil: "domcontentloaded" });
	const map = await readyMap(page);
	await map.getByRole("button", { name: "확대" }).click();
	await expect(map).toHaveAttribute("data-bus-vehicles", "1");

	await fixture.emitVehicles({ bus: [firstBus], subway: [movedTrain] });
	await expect(map).toHaveAttribute(
		"data-subway-vehicle-position",
		movedTrain.coordinates.join(","),
	);
	expect(movedTrain.coordinates).not.toEqual(firstTrain.coordinates);

	await fixture.emitAvailability({ bus: "unavailable", subway: "live" });
	await expect(page.getByText("버스 실시간 정보를 불러오지 못했습니다")).toBeVisible();
	await expect(map).toHaveAttribute("data-bus-vehicles", "0");
	await expect(map).toHaveAttribute("data-subway-vehicles", "1");
	await expect(map).toHaveAttribute("data-bus-lines", "1");

	expect(fixture.unexpectedExternalRequests).toEqual([]);
	expectCleanAudit(audit);
});

test("clears all vehicles on disconnect and reconnects without relabelling stale data", async ({
	page,
}) => {
	const audit = observeNetworkAudit(page);
	const fixture = await installPreviewFixtures(page);
	await page.goto("/3d-preview", { waitUntil: "domcontentloaded" });
	const map = await readyMap(page);
	const beforeConnections = await fixture.connectionCount();
	await expect(map).toHaveAttribute("data-subway-vehicles", "1");

	await fixture.disconnect();
	await expect(map).toHaveAttribute("data-subway-vehicles", "0");
	await expect(map).toHaveAttribute("data-bus-vehicles", "0");
	await expect(page.getByRole("status", { name: "실시간 운행 상태" })).toContainText(
		"실시간 연결됨",
	);
	await expect(map).toHaveAttribute("data-subway-lines", "1");
	expect(await fixture.connectionCount()).toBeGreaterThan(beforeConnections);

	expect(fixture.unexpectedExternalRequests).toEqual([]);
	expectCleanAudit(audit);
});

for (const viewport of [
	{ width: 360, height: 800, layout: "mobile" },
	{ width: 768, height: 1024, layout: "mobile" },
	{ width: 960, height: 900, layout: "desktop" },
	{ width: 1440, height: 900, layout: "desktop" },
] as const) {
	test(`keeps the map and independently scrolling rail bounded at ${viewport.width}x${viewport.height}`, async ({
		page,
	}) => {
		await page.setViewportSize(viewport);
		const audit = observeNetworkAudit(page);
		const fixture = await installPreviewFixtures(page);
		await page.goto("/3d-preview", { waitUntil: "domcontentloaded" });
		await readyMap(page);

		const rail = await page.locator(".map-preview-rail").boundingBox();
		const map = await page.locator(".map-preview-map").boundingBox();
		if (!rail || !map) throw new Error("Preview layout did not render");
		if (viewport.layout === "desktop") {
			expect(rail.width).toBe(420);
			expect(map.x).toBe(420);
			expect(map.height).toBe(viewport.height);
		} else {
			expect(map.y).toBe(0);
			expect(rail.y).toBeGreaterThanOrEqual(map.y + map.height - 1);
			expect(rail.width).toBe(viewport.width);
		}
		expect(
			await page.evaluate(
				() => document.documentElement.scrollWidth <= window.innerWidth,
			),
		).toBe(true);
		expect(fixture.unexpectedExternalRequests).toEqual([]);
		expectCleanAudit(audit);
	});
}

test.describe("reduced motion", () => {
	test("jumps to each live snapshot while preserving keyboard controls", async ({
		page,
	}) => {
		await page.emulateMedia({ reducedMotion: "reduce" });
		const audit = observeNetworkAudit(page);
		const fixture = await installPreviewFixtures(page);
		await page.goto("/3d-preview", { waitUntil: "domcontentloaded" });
		const map = await readyMap(page);

		await fixture.emitVehicles({ bus: [], subway: [movedTrain] });
		await expect(map).toHaveAttribute(
			"data-subway-vehicle-position",
			movedTrain.coordinates.join(","),
		);
		const toggle = page.getByRole("button", { name: "지하철 표시" });
		await expect(toggle).toHaveCSS("transition-duration", "0.001s");
		await toggle.focus();
		await page.keyboard.press("Enter");
		await expect(map).toHaveAttribute("data-subway-vehicles", "0");

		expect(fixture.unexpectedExternalRequests).toEqual([]);
		expectCleanAudit(audit);
	});
});

test("turns a style failure into an escapable fatal state", async ({ page }) => {
	const audit = observeNetworkAudit(page);
	const fixture = await installPreviewFixtures(page, {
		onStyle: (route) =>
			route.fulfill({ status: 503, json: { error: "STYLE_FIXTURE_FAILURE" } }),
	});
	await page.goto("/3d-preview", { waitUntil: "domcontentloaded" });
	await expect(page.getByRole("alert", { name: "3D 지도 치명적 오류" })).toBeVisible();
	await expect(
		page
			.getByRole("alert", { name: "3D 지도 치명적 오류" })
			.getByRole("link", { name: "모타로 돌아가기" }),
	).toBeVisible();
	expect(fixture.unexpectedExternalRequests).toEqual([]);
	expect(audit.pageErrors).toEqual([]);
	expect(audit.requestFailures).toEqual([]);
	expect(audit.consoleErrors.join("\n")).toContain("503");
});

test("reports unsupported WebGL without hiding the return path", async ({ page }) => {
	await page.addInitScript(() => {
		const original = HTMLCanvasElement.prototype.getContext;
		Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
			configurable: true,
			value(this: HTMLCanvasElement, contextId: string, ...args: unknown[]) {
				if (contextId === "webgl" || contextId === "webgl2") return null;
				return Reflect.apply(original, this, [contextId, ...args]);
			},
		});
	});
	const fixture = await installPreviewFixtures(page);
	await page.goto("/3d-preview", { waitUntil: "domcontentloaded" });
	await expect(page.getByRole("alert", { name: "3D 지도 치명적 오류" })).toBeVisible();
	await expect(
		page
			.getByRole("alert", { name: "3D 지도 치명적 오류" })
			.getByRole("link", { name: "모타로 돌아가기" }),
	).toBeVisible();
	expect(fixture.unexpectedExternalRequests).toEqual([]);
});

test("treats a style without the required 3D building layer as fatal", async ({
	page,
}) => {
	const audit = observeNetworkAudit(page);
	const fixture = await installPreviewFixtures(page, {
		style: {
			...localBuildingStyle,
			layers: localBuildingStyle.layers.filter((layer) => layer.id !== "building-3d"),
		},
	});
	await page.goto("/3d-preview", { waitUntil: "domcontentloaded" });
	await expect(page.getByRole("alert", { name: "3D 지도 치명적 오류" })).toBeVisible();
	await expect(page.getByText("3D 건물 정보를 확인할 수 없습니다.")).toBeVisible();
	expect(fixture.unexpectedExternalRequests).toEqual([]);
	expectCleanAudit(audit);
});
