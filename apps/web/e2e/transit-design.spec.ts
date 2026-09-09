import { expect, test, type Page } from "@playwright/test";

const station = {
	id: "design-station",
	name: "건대입구",
	line: "2호선",
	lat: 37.5404,
	lng: 127.0693,
	distanceMeters: 120,
};
const stop = {
	id: "design-stop",
	arsId: "05142",
	name: "한양대학교앞",
	lat: 37.5572,
	lng: 127.0437,
	distanceMeters: 180,
};
const selectedPoints = {
	busStops: [stop],
	subwayStations: [station],
	selectedBusStopIds: [stop.id],
	selectedSubwayStationId: station.id,
};
const emptyPoints = {
	busStops: [],
	subwayStations: [],
	selectedBusStopIds: [],
	selectedSubwayStationId: null,
};
const updatedAt = "2026-09-09T09:00:00.000Z";
const subwayArrivals = ["상행", "하행"].flatMap((updnLine) =>
	[180, 480, 840, 1200].map((seconds, index) => ({
		id: `${updnLine}-${index}`,
		subwayId: "1002",
		updnLine,
		line: "2호선",
		direction: updnLine === "상행" ? "성수 방면" : "신도림 방면",
		trainLineNm: updnLine === "상행" ? "성수행" : "신도림행",
		trainStatus: "일반",
		seconds,
		generatedAt: updatedAt,
		message: "전전역 출발",
		location: "성수",
		isLastTrain: index === 2,
	})),
);

async function installTransitFixture(page: Page) {
	await page.clock.setFixedTime(new Date(updatedAt));
	await page.addInitScript(
		(selections) => {
			if (localStorage.getItem("mota:transit-selections:v1") === null) {
				localStorage.setItem("mota:transit-selections:v1", JSON.stringify(selections));
			}
		},
		{ commutes: { toWork: selectedPoints, toHome: emptyPoints } },
	);
	await page.route("**/api/auth/session", (route) =>
		route.fulfill({ json: { authenticated: false, user: null } }),
	);
	await page.route("**/api/arrivals/*", (route) =>
		route.fulfill({
			json: {
				updatedAt,
				arrivals: [0, 1, 2, 3].map((index) => ({
					routeId: `design-route-${index}`,
					routeName: String(201 + index),
					direction: "서울역",
					routeType: "3",
					lowFloor: index === 0,
					first: {
						message: `${3 + index * 4}분 후`,
						seconds: 180 + index * 240,
						remainingStops: 2 + index,
						congestion: "여유",
					},
					second: null,
				})),
			},
		}),
	);
	await page.route("**/api/subway/arrivals?*", (route) =>
		route.fulfill({ json: { arrivals: subwayArrivals, updatedAt } }),
	);
	await page.route("**/api/stops/nearby?*", (route) =>
		route.fulfill({ json: { stops: [stop] } }),
	);
	await page.route("**/api/subway/nearby?*", (route) =>
		route.fulfill({ json: { stations: [station] } }),
	);
	// The checks exercise DOM, layout and selection, not external tile/font services.
	await page.route(/^https:\/\/(cdn\.jsdelivr\.net|fonts\.googleapis\.com)\//, (route) =>
		route.fulfill({ contentType: "text/css", body: "" }),
	);
	await page.route("https://*.tile.openstreetmap.org/**", (route) =>
		route.fulfill({
			contentType: "image/png",
			body: Buffer.from(
				"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+X8W7WQAAAABJRU5ErkJggg==",
				"base64",
			),
		}),
	);
}

for (const viewport of [
	{ width: 360, height: 800 },
	{ width: 768, height: 1024 },
	{ width: 1440, height: 900 },
]) {
	test(`transit selection and arrivals remain usable at ${viewport.width}px`, async ({
		page,
	}, testInfo) => {
		// Given an anonymous commuter with saved points in the work context only.
		await page.setViewportSize(viewport);
		await installTransitFixture(page);
		await page.goto("/");
		await expect(page.locator(".arrival-row")).toHaveCount(3);
		await page.screenshot({ path: testInfo.outputPath("bus.png") });

		// When switching mode and direction through real keyboard controls.
		await page.getByRole("tab", { name: "지하철", exact: true }).click();
		await expect(page.locator(".arrival-row")).toHaveCount(3);
		const down = page.getByRole("tab", { name: "2호선 하행", exact: true });
		await page.getByRole("tab", { name: "2호선 상행", exact: true }).press("ArrowRight");

		// Then direction state, bounded presentation and responsive geometry survive.
		await expect(down).toBeFocused();
		await expect(down).toHaveAttribute("aria-selected", "true");
		await expect(page.locator(".arrival-row")).toHaveCount(3);
		expect(
			await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
		).toBe(true);
		const smallTargets = await page.locator("button").evaluateAll((buttons) =>
			buttons.filter((button) => {
				const bounds = button.getBoundingClientRect();
				return bounds.width > 0 && bounds.height > 0 && bounds.height < 44;
			}).map((button) => button.getAttribute("aria-label") ?? button.textContent),
		);
		expect(smallTargets).toEqual([]);
		await page.screenshot({ path: testInfo.outputPath("subway.png") });
		if (viewport.width < 960) {
			await expect(page.locator(".leaflet-container")).toHaveCount(0);
			await page.getByRole("button", { name: "지도 열기", exact: true }).click();
		}
		await expect(page.locator(".leaflet-container")).toBeVisible();
		const mapBounds = await page.locator(".leaflet-container").boundingBox();
		expect(mapBounds?.height).toBeGreaterThan(100);
		expect(mapBounds?.width).toBeGreaterThan(100);
		await page.screenshot({ path: testInfo.outputPath("map-open.png") });
	});
}

test("commute contexts and saved selections remain independent after reload", async ({ page }) => {
	await installTransitFixture(page);
	await page.goto("/");
	await expect(page.locator(".point-row")).toHaveCount(1);
	await page.getByRole("tab", { name: "퇴근", exact: true }).click();
	await expect(page.locator(".point-row")).toHaveCount(0);
	await page.getByRole("tab", { name: "출근", exact: true }).click();
	await page.getByRole("button", { name: `${stop.name} 정류장 삭제` }).click();
	await page.reload();
	await expect(page.locator(".point-row")).toHaveCount(0);
	await page.getByRole("tab", { name: "지하철", exact: true }).click();
	await expect(page.locator(".point-row")).toHaveCount(1);
});

test("arrival errors retain previous results and recover through retry", async ({ page }, testInfo) => {
	await installTransitFixture(page);
	await page.goto("/");
	await expect(page.locator(".arrival-row")).toHaveCount(3);
	await page.route("**/api/arrivals/*", (route) =>
		route.fulfill({ status: 503, json: { error: "UPSTREAM_UNAVAILABLE" } }),
	);
	await page.getByRole("button", { name: `${stop.name} 버스 도착정보 새로고침` }).click();
	await expect(page.getByRole("alert")).toBeVisible();
	await expect(page.locator(".arrival-row")).toHaveCount(3);
	await page.screenshot({ path: testInfo.outputPath("retained-error.png") });
	await page.route("**/api/arrivals/*", (route) =>
		route.fulfill({ json: { arrivals: [], updatedAt } }),
	);
	await page.getByRole("button", { name: "다시 시도", exact: true }).click();
	await expect(page.getByRole("alert")).toHaveCount(0);
	await expect(page.locator(".arrival-row")).toHaveCount(0);
	await expect(page.locator(".arrival-empty")).toBeVisible();
});
