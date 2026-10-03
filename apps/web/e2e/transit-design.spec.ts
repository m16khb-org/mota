import { expect, test, type Page } from "@playwright/test";

const stop = {
  id: "design-stop",
  arsId: "05142",
  name: "한양대학교앞",
  lat: 37.5572,
  lng: 127.0437,
  distanceMeters: 180,
};
const extraStop = {
  ...stop,
  id: "extra-stop",
  arsId: "05143",
  name: "왕십리역앞",
  lat: 37.561,
  lng: 127.038,
};
const selectedPoints = {
  busStops: [stop],
  subwayStations: { obsolete: "malformed legacy field" },
  selectedBusStopIds: [stop.id],
  selectedSubwayStationId: ["retired"],
};
const emptyPoints = {
  busStops: [],
  subwayStations: [],
  selectedBusStopIds: [],
  selectedSubwayStationId: null,
};
const updatedAt = "2026-09-09T09:00:00.000Z";
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
  await page.route("**/api/stops/nearby?*", (route) =>
    route.fulfill({ json: { stops: [stop, extraStop] } }),
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

    // Bus-only UI and keyboard commute controls preserve the saved stop.
    await expect(page.getByRole("tab", { name: "지하철", exact: true })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "3D 지도 미리보기" })).toHaveCount(0);
    await page.getByRole("tab", { name: "출근", exact: true }).press("ArrowRight");
    await expect(page.getByRole("tab", { name: "퇴근", exact: true })).toBeFocused();
    await expect(page.locator(".point-row")).toHaveCount(0);
    await page.getByRole("tab", { name: "퇴근", exact: true }).press("ArrowLeft");
    await expect(page.locator(".arrival-row")).toHaveCount(3);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    const smallTargets = await page.locator("button").evaluateAll((buttons) =>
      buttons
        .filter((button) => {
          const bounds = button.getBoundingClientRect();
          return bounds.width > 0 && bounds.height > 0 && (bounds.height < 44 || bounds.width < 44);
        })
        .map((button) => button.getAttribute("aria-label") ?? button.textContent),
    );
    expect(smallTargets).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath("bus-keyboard.png") });
    if (viewport.width < 960) {
      await expect(page.locator(".leaflet-container")).toHaveCount(0);
      await page.getByRole("button", { name: "지도 열기", exact: true }).click();
    }
    await expect(page.locator(".leaflet-container")).toBeVisible();
    const mapBounds = await page.locator(".leaflet-container").boundingBox();
    expect(mapBounds?.height).toBeGreaterThan(100);
    expect(mapBounds?.width).toBeGreaterThan(100);
    if (viewport.width >= 960)
      expect((await page.locator(".control-rail").boundingBox())?.width).toBe(420);
    await page.screenshot({ path: testInfo.outputPath("map-open.png") });
  });
}

for (const viewport of [
  { width: 360, height: 800 },
  { width: 1440, height: 900 },
]) {
  test(`commute contexts preserve add, selection, delete and reload at ${viewport.width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize(viewport);
    await installTransitFixture(page);
    await page.goto("/");
    await expect(page.locator(".point-row")).toHaveCount(1);
    await page.getByRole("button", { name: "정류장 찾기", exact: true }).click();
    const candidate = page.locator(".inline-map-result").filter({ hasText: extraStop.name });
    await candidate.click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: testInfo.outputPath("bus-search.png") });
    await expect(candidate).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "1곳 저장", exact: true }).click();
    await expect(page.locator(".point-row")).toHaveCount(2);
    await expect(page.locator(".arrival-row")).toHaveCount(6);
    await expect(page.getByRole("button", { name: "정류장 찾기", exact: true })).toBeFocused();
    await page.getByRole("tab", { name: "퇴근", exact: true }).click();
    await expect(page.locator(".point-row")).toHaveCount(0);
    await page.getByRole("button", { name: "정류장 찾기", exact: true }).click();
    await page.locator(".inline-map-result").filter({ hasText: stop.name }).click();
    await page.getByRole("button", { name: "1곳 저장", exact: true }).click();
    await page.getByRole("tab", { name: "출근", exact: true }).click();
    await page
      .getByRole("button", { name: `${stop.name} ARS ${stop.arsId} 지금 보는 곳`, exact: true })
      .click();
    await expect(page.locator(".arrival-row")).toHaveCount(3);
    await page.getByRole("button", { name: `${stop.name} 정류장 삭제`, exact: true }).click();
    await page.reload();
    await expect(page.locator(".point-row")).toHaveCount(1);
    await expect(page.getByRole("heading", { name: `${extraStop.name} 다음 버스` })).toBeVisible();
    await page.getByRole("tab", { name: "퇴근", exact: true }).click();
    await expect(page.locator(".point-row")).toHaveCount(1);
    await expect(page.getByRole("heading", { name: `${stop.name} 다음 버스` })).toBeVisible();
    const stored = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("mota:transit-selections:v1") ?? "null"),
    );
    expect(Object.keys(stored.commutes.toWork).sort()).toEqual(["busStops", "selectedBusStopIds"]);
  });
}

test("legacy preview links reach the bus home without subway requests", async ({ page }) => {
  await installTransitFixture(page);
  const retiredRequests: string[] = [];
  page.on("request", (request) => {
    if (/\/api\/(subway|transit-map)/.test(request.url())) retiredRequests.push(request.url());
  });
  await page.goto("/3d-preview");
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: `${stop.name} 다음 버스` })).toBeVisible();
  await expect(page.locator(".arrival-row")).toHaveCount(3);
  expect(retiredRequests).toEqual([]);
});

test("arrival errors retain previous results and recover through retry", async ({
  page,
}, testInfo) => {
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
