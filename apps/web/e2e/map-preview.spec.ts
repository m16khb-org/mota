import { expect, test, type Page, type Route } from "@playwright/test";
import {
  busStops,
  changedBusStops,
  changedSubwayStations,
  installPreviewFixtures,
  localBuildingStyle,
  type NetworkAudit,
  observeNetworkAudit,
  subwayStations,
} from "./fixtures/mapPreviewFixtures";

const initialQuery = { lat: "37.536600", lng: "127.125300" };

function expectCleanAudit(audit: NetworkAudit) {
  expect(audit.consoleErrors).toEqual([]);
  expect(audit.pageErrors).toEqual([]);
  expect(audit.requestFailures).toEqual([]);
}

function expectDeliberateHttpFailure(audit: NetworkAudit, status: number) {
  expect(audit.consoleErrors).toHaveLength(1);
  expect(audit.consoleErrors[0]).toContain(String(status));
  expect(audit.pageErrors).toEqual([]);
  expect(audit.requestFailures).toEqual([]);
}

async function readyMap(page: Page) {
  const map = page.getByTestId("maplibre-preview-map");
  await expect(map).toHaveAttribute("data-map-ready", "true");
  return map;
}

async function dragMap(page: Page, deltaX: number, deltaY = 0, button: "left" | "right" = "left") {
  const box = await page.getByTestId("maplibre-preview-map").boundingBox();
  if (!box) throw new Error("Map fixture did not expose a pointer surface");
  const x = box.x + box.width * 0.56;
  const y = box.y + box.height * 0.52;
  await page.mouse.move(x, y);
  await page.mouse.down({ button });
  await page.mouse.move(x + deltaX, y + deltaY, { steps: 5 });
  await page.mouse.up({ button });
}

test("keeps the current app free of preview resources and supports direct, refresh, and back navigation", async ({
  page,
}) => {
  const audit = observeNetworkAudit(page);
  const resources: string[] = [];
  page.on("request", (request) => resources.push(request.url()));
  const fixture = await installPreviewFixtures(page);

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("link", { name: "3D 지도 미리보기" })).toBeVisible();
  expect(resources.some((url) => /MapPreviewPage|maplibre|openfreemap/i.test(url))).toBe(false);
  expect(fixture.requests).toEqual([]);

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

test("renders the local 3D scene, linked point details, controls, and exact request matrix", async ({
  page,
}) => {
  const audit = observeNetworkAudit(page);
  const fixture = await installPreviewFixtures(page, {
    onBus: async (route, url) => {
      const stops = url.searchParams.get("lat") === initialQuery.lat ? busStops : changedBusStops;
      await route.fulfill({ json: { stops } });
    },
    onSubway: async (route, url) => {
      const stations =
        url.searchParams.get("lat") === initialQuery.lat ? subwayStations : changedSubwayStations;
      await route.fulfill({ json: { stations } });
    },
  });
  await page.goto("/3d-preview", { waitUntil: "domcontentloaded" });

  const map = await readyMap(page);
  await expect(map).toHaveAttribute("data-building-layer", "building-3d");
  await expect(map).toHaveAttribute("data-center-lng", initialQuery.lng);
  await expect(map).toHaveAttribute("data-center-lat", initialQuery.lat);
  await expect(map).toHaveAttribute("data-zoom", "15.000");
  await expect(map).toHaveAttribute("data-pitch", "42.000");
  await expect(map).toHaveAttribute("data-bearing", "-20.000");
  await expect(map.locator("canvas.maplibregl-canvas")).toBeVisible();
  await expect(map.locator('[data-mode="bus"][data-marker-shape="circle"]')).toHaveCount(1);
  await expect(map.locator('[data-mode="subway"][data-marker-shape="diamond"]')).toHaveCount(1);
  await expect(map.locator('a[href="https://openfreemap.org/"]')).toBeVisible();
  await expect(map.locator('a[href="https://openmaptiles.org/"]')).toBeVisible();
  await expect(map.locator('a[href="https://www.openstreetmap.org/copyright"]')).toBeVisible();

  const busRow = page
    .locator(".map-preview-point-list")
    .getByRole("button", { name: `버스 ${busStops[0]?.name}` });
  await busRow.click();
  await expect(map.locator('[data-point-key="bus:bus-a"]')).toHaveAttribute("aria-pressed", "true");
  await expect(map.locator(".map-preview-popup-detail__name")).toHaveText(busStops[0]?.name ?? "");
  await expect(map.locator(".map-preview-popup-detail__meta")).toHaveText(busStops[0]?.arsId ?? "");

  const popupClose = map.locator(".maplibregl-popup-close-button");
  await expect(popupClose).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(map.locator('[data-point-key="bus:bus-a"]')).toBeFocused();
  await expect(busRow).toHaveAttribute("aria-pressed", "false");
  await map.locator('[data-point-key="bus:bus-a"]').click();
  await expect(map.locator(".map-preview-popup-detail__name")).toHaveText(busStops[0]?.name ?? "");

  const initialRequests = fixture.requests.map(({ kind, url }) => ({
    kind,
    lat: url.searchParams.get("lat"),
    lng: url.searchParams.get("lng"),
    radius: url.searchParams.get("radius"),
  }));
  expect(initialRequests).toEqual([
    { kind: "bus", ...initialQuery, radius: "800" },
    { kind: "subway", ...initialQuery, radius: "3000" },
  ]);

  await map.getByRole("button", { name: "확대" }).click();
  await expect(map).toHaveAttribute("data-zoom", "16.000");
  expect(fixture.requests).toHaveLength(2);
  const changedBusRequest = page.waitForRequest(
    (request) =>
      request.url().includes("/api/stops/nearby") &&
      !request.url().includes(`lat=${initialQuery.lat}`),
  );
  const changedSubwayRequest = page.waitForRequest(
    (request) =>
      request.url().includes("/api/subway/nearby") &&
      !request.url().includes(`lat=${initialQuery.lat}`),
  );
  await dragMap(page, 96, 24);
  await Promise.all([changedBusRequest, changedSubwayRequest]);
  await expect(
    page
      .locator(".map-preview-point-list")
      .getByRole("button", { name: `버스 ${changedBusStops[0]?.name}` }),
  ).toBeVisible();
  expect(fixture.requests).toHaveLength(4);
  for (const request of fixture.requests.slice(2)) {
    expect(request.url.searchParams.get("lat")).toMatch(/^37\.\d{6}$/);
    expect(request.url.searchParams.get("lng")).toMatch(/^127\.\d{6}$/);
    expect(request.url.searchParams.get("lat")).not.toBe(initialQuery.lat);
  }
  await map.getByRole("button", { name: "축소" }).click();
  await expect(map).toHaveAttribute("data-zoom", "15.000");
  expect(fixture.requests).toHaveLength(4);
  await expect(
    map.getByRole("button", {
      name: "드래그하여 지도를 회전하고 클릭하여 북쪽으로 재설정",
    }),
  ).toBeVisible();
  await dragMap(page, 64, 36, "right");
  await expect(map).not.toHaveAttribute("data-bearing", "-20.000");
  await expect(map).not.toHaveAttribute("data-pitch", "42.000");
  expect(fixture.requests).toHaveLength(4);

  expect(fixture.unexpectedExternalRequests).toEqual([]);
  expectCleanAudit(audit);
});

for (const viewport of [
  { width: 360, height: 800, layout: "mobile" },
  { width: 768, height: 1024, layout: "mobile" },
  { width: 960, height: 900, layout: "desktop" },
  { width: 1440, height: 900, layout: "desktop" },
] as const) {
  test(`keeps map, rail, and list bounded at ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    const audit = observeNetworkAudit(page);
    const fixture = await installPreviewFixtures(page);
    await page.goto("/3d-preview", { waitUntil: "domcontentloaded" });
    await readyMap(page);

    const header = await page.locator(".map-preview-header").boundingBox();
    const map = await page.locator(".map-preview-map").boundingBox();
    const points = await page.locator(".map-preview-points").boundingBox();
    if (!header || !map || !points) throw new Error("Preview grid did not render");
    if (viewport.layout === "desktop") {
      expect(header.width).toBe(420);
      expect(map.x).toBe(420);
      expect(points.width).toBe(420);
    } else {
      expect(map.y).toBe(0);
      expect(header.y).toBeGreaterThanOrEqual(map.y + map.height - 1);
      expect(points.y).toBeGreaterThanOrEqual(header.y + header.height - 1);
    }
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await expect(
      page.getByTestId("maplibre-preview-map").locator(".maplibregl-ctrl-attrib"),
    ).toBeVisible();
    expect(fixture.unexpectedExternalRequests).toEqual([]);
    expectCleanAudit(audit);
  });
}

test.describe("reduced motion", () => {
	test("removes preview transitions without disabling direct controls", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    const audit = observeNetworkAudit(page);
    const fixture = await installPreviewFixtures(page);
    await page.goto("/3d-preview", { waitUntil: "domcontentloaded" });
    const map = await readyMap(page);
    expect(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(
      true,
    );
    await expect(map.locator('[data-mode="bus"]')).toHaveCSS("transition-duration", "0.001s");
    await map.getByRole("button", { name: "확대" }).click();
    await expect(map).toHaveAttribute("data-zoom", "16.000");
    expect(fixture.requests).toHaveLength(2);
    expect(fixture.unexpectedExternalRequests).toEqual([]);
    expectCleanAudit(audit);
  });
});

for (const catalogFailure of [
  {
    failed: "bus",
    alertName: "버스 정류장 오류",
    successfulCountName: "지하철역 수",
    successfulMode: "subway",
  },
  {
    failed: "subway",
    alertName: "지하철역 오류",
    successfulCountName: "버스 정류장 수",
    successfulMode: "bus",
  },
] as const) {
  test(`keeps the other catalog and map usable when ${catalogFailure.failed} fails`, async ({
    page,
  }) => {
    const audit = observeNetworkAudit(page);
    const fail = (route: Route) =>
      route.fulfill({ status: 503, json: { error: "API_FIXTURE_FAILURE" } });
    const fixture = await installPreviewFixtures(page, {
      onBus: catalogFailure.failed === "bus" ? fail : undefined,
      onSubway: catalogFailure.failed === "subway" ? fail : undefined,
    });
    await page.goto("/3d-preview", { waitUntil: "domcontentloaded" });
    const map = await readyMap(page);
    await expect(page.getByRole("alert", { name: catalogFailure.alertName })).toBeVisible();
    await expect(page.getByLabel(catalogFailure.successfulCountName)).toHaveText("1곳");
    await expect(map.locator(`[data-mode="${catalogFailure.successfulMode}"]`)).toHaveCount(1);
    await expect(map.locator("canvas.maplibregl-canvas")).toBeVisible();
    expect(fixture.unexpectedExternalRequests).toEqual([]);
    expectDeliberateHttpFailure(audit, 503);
  });
}

test("turns a style request failure into an escapable fatal state", async ({ page }) => {
  const audit = observeNetworkAudit(page);
  const fixture = await installPreviewFixtures(page, {
    onStyle: (route) => route.fulfill({ status: 503, json: { error: "STYLE_FIXTURE_FAILURE" } }),
  });
  await page.goto("/3d-preview", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("alert", { name: "3D 지도 치명적 오류" })).toBeVisible();
  await expect(page.getByRole("link", { name: "모타로 돌아가기" })).toHaveAttribute("href", "/");
  await expect(page.getByTestId("maplibre-preview-map")).toHaveCount(0);
  expect(fixture.unexpectedExternalRequests).toEqual([]);
  expectDeliberateHttpFailure(audit, 503);
});

test("reports unsupported WebGL construction without hiding the return path", async ({ page }) => {
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
  const audit = observeNetworkAudit(page);
  const fixture = await installPreviewFixtures(page);
  await page.goto("/3d-preview", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("alert", { name: "3D 지도 치명적 오류" })).toBeVisible();
  await expect(page.getByRole("link", { name: "모타로 돌아가기" })).toBeVisible();
  expect(fixture.unexpectedExternalRequests).toEqual([]);
  expectCleanAudit(audit);
});

test("turns a subscribed forced WebGL context loss into the fatal state", async ({ page }) => {
  const audit = observeNetworkAudit(page);
  const fixture = await installPreviewFixtures(page);
  await page.goto("/3d-preview", { waitUntil: "domcontentloaded" });
  const map = await readyMap(page);
  const fatalState = page
    .getByRole("alert", { name: "3D 지도 치명적 오류" })
    .waitFor({ state: "visible" });
	const supported = await map.locator("canvas.maplibregl-canvas").evaluate((element) => {
		const canvas = element as HTMLCanvasElement;
		const context = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
    const extension = context?.getExtension("WEBGL_lose_context");
    if (!extension) return false;
    extension.loseContext();
    return true;
  });
  expect(supported).toBe(true);
  await fatalState;
  await expect(page.getByRole("link", { name: "모타로 돌아가기" })).toBeVisible();
  expect(fixture.unexpectedExternalRequests).toEqual([]);
  expectCleanAudit(audit);
});

interface Deferred<T> {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

async function fulfillIfOpen(route: Route, body: object) {
  await route.fulfill({ json: body }).catch(() => undefined);
}

test("keeps only the latest center when earlier API responses settle last", async ({ page }) => {
  const busResponses = [deferred<object>(), deferred<object>()];
  const subwayResponses = [deferred<object>(), deferred<object>()];
  const busArrivals = [deferred<void>(), deferred<void>()];
  const subwayArrivals = [deferred<void>(), deferred<void>()];
  let busCall = 0;
  let subwayCall = 0;
  const audit = observeNetworkAudit(page);
  const fixture = await installPreviewFixtures(page, {
    onBus: async (route) => {
      const index = busCall++;
      if (index === 0) {
        await route.fulfill({ json: { stops: busStops } });
        return;
      }
      const pendingIndex = index - 1;
      busArrivals[pendingIndex]?.resolve();
      const body = await busResponses[pendingIndex]?.promise;
      if (body) await fulfillIfOpen(route, body);
    },
    onSubway: async (route) => {
      const index = subwayCall++;
      if (index === 0) {
        await route.fulfill({ json: { stations: subwayStations } });
        return;
      }
      const pendingIndex = index - 1;
      subwayArrivals[pendingIndex]?.resolve();
      const body = await subwayResponses[pendingIndex]?.promise;
      if (body) await fulfillIfOpen(route, body);
    },
  });
  await page.goto("/3d-preview", { waitUntil: "domcontentloaded" });
  await readyMap(page);
  await dragMap(page, 72, 12);
  await Promise.all([busArrivals[0]?.promise, subwayArrivals[0]?.promise]);
  await dragMap(page, -138, -18);
  await Promise.all([busArrivals[1]?.promise, subwayArrivals[1]?.promise]);

  busResponses[1]?.resolve({ stops: changedBusStops });
  subwayResponses[1]?.resolve({ stations: changedSubwayStations });
  await expect(
    page
      .locator(".map-preview-point-list")
      .getByRole("button", { name: `버스 ${changedBusStops[0]?.name}` }),
  ).toBeVisible();
  busResponses[0]?.resolve({
    stops: [{ ...busStops[0], id: "bus-stale", name: "늦은 정류장" }],
  });
  subwayResponses[0]?.resolve({
    stations: [{ ...subwayStations[0], id: "subway-stale", name: "늦은 지하철역" }],
  });
  await expect(
    page
      .locator(".map-preview-point-list")
      .getByRole("button", { name: `버스 ${changedBusStops[0]?.name}` }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /늦은 정류장/ })).toHaveCount(0);
  expect(fixture.requests).toHaveLength(6);
  expect(fixture.unexpectedExternalRequests).toEqual([]);
  expect(audit.consoleErrors).toEqual([]);
  expect(audit.pageErrors).toEqual([]);
  expect(
    audit.requestFailures.every(
      (failure) => failure.includes("/api/") && failure.includes("ERR_ABORTED"),
    ),
  ).toBe(true);
});

test("treats a valid style without building-3d as fatal", async ({ page }) => {
  const audit = observeNetworkAudit(page);
  const fixture = await installPreviewFixtures(page, {
    style: {
      ...localBuildingStyle,
      layers: localBuildingStyle.layers.filter((layer) => layer.id !== "building-3d"),
    },
  });
  await page.goto("/3d-preview", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("alert", { name: "3D 지도 치명적 오류" })).toBeVisible();
  await expect(page.getByRole("link", { name: "모타로 돌아가기" })).toBeVisible();
  expect(fixture.unexpectedExternalRequests).toEqual([]);
  expectCleanAudit(audit);
});
