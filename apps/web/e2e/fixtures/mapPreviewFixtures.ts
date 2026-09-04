import type { Page, Route } from "@playwright/test";

export const previewStyleUrl = "https://tiles.openfreemap.org/styles/liberty";

export const busStops = [
  {
    id: "bus-a",
    arsId: "12345",
    name: "천호역 정류장",
    lat: 37.53675,
    lng: 127.12545,
    distanceMeters: 24,
  },
];

export const subwayStations = [
  {
    id: "subway-a",
    name: "천호",
    line: "5호선",
    lat: 37.53795,
    lng: 127.12305,
    distanceMeters: 182,
  },
];

export const changedBusStops = [
  {
    id: "bus-changed",
    arsId: "54321",
    name: "이동한 중심 정류장",
    lat: 37.5372,
    lng: 127.126,
    distanceMeters: 31,
  },
];

export const changedSubwayStations = [
  {
    id: "subway-changed",
    name: "이동한 중심역",
    line: "8호선",
    lat: 37.5382,
    lng: 127.124,
    distanceMeters: 205,
  },
];

export const localBuildingStyle = {
  version: 8 as const,
  name: "Mota deterministic building fixture",
  sources: {
    openmaptiles: {
      type: "geojson" as const,
      attribution:
        '<a href="https://openfreemap.org/">OpenFreeMap</a> · <a href="https://openmaptiles.org/">OpenMapTiles</a> · <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      data: {
        type: "FeatureCollection" as const,
        features: [
          {
            type: "Feature" as const,
            properties: { height: 48, minHeight: 0 },
            geometry: {
              type: "Polygon" as const,
              coordinates: [
                [
                  [127.1247, 37.5362],
                  [127.1259, 37.5362],
                  [127.1259, 37.537],
                  [127.1247, 37.537],
                  [127.1247, 37.5362],
                ],
              ],
            },
          },
        ],
      },
    },
  },
  layers: [
    {
      id: "background",
      type: "background" as const,
      paint: { "background-color": "#f3f3ec" },
    },
    {
      id: "building-3d",
      type: "fill-extrusion" as const,
      source: "openmaptiles",
      paint: {
        "fill-extrusion-color": "#a7a7a0",
        "fill-extrusion-height": ["get", "height"],
        "fill-extrusion-base": ["get", "minHeight"],
        "fill-extrusion-opacity": 0.88,
      },
    },
  ],
};

export interface RequestRecord {
  readonly kind: "bus" | "subway";
  readonly url: URL;
}

export interface NetworkAudit {
  readonly consoleErrors: string[];
  readonly pageErrors: string[];
  readonly requestFailures: string[];
}

export interface PreviewFixtureState {
  readonly requests: RequestRecord[];
  readonly unexpectedExternalRequests: string[];
}

export function observeNetworkAudit(page: Page): NetworkAudit {
  const audit: NetworkAudit = {
    consoleErrors: [],
    pageErrors: [],
    requestFailures: [],
  };
  page.on("console", (message) => {
    if (message.type() === "error") audit.consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => audit.pageErrors.push(error.message));
  page.on("requestfailed", (request) => {
    audit.requestFailures.push(`${request.url()} :: ${request.failure()?.errorText ?? "unknown"}`);
  });
  return audit;
}

export async function installPreviewFixtures(
  page: Page,
  options: {
    readonly style?: object;
    readonly onStyle?: (route: Route) => Promise<void>;
    readonly onBus?: (route: Route, url: URL) => Promise<void>;
    readonly onSubway?: (route: Route, url: URL) => Promise<void>;
  } = {},
): Promise<PreviewFixtureState> {
  const requests: RequestRecord[] = [];
  const unexpectedExternalRequests: string[] = [];
  await page.route(/^https:\/\//, async (route) => {
    unexpectedExternalRequests.push(route.request().url());
    await route.fulfill({ status: 418, body: "blocked external fixture" });
  });
  await page.route("https://cdn.jsdelivr.net/**", (route) =>
    route.fulfill({
      contentType: "text/css; charset=utf-8",
      body: "/* deterministic empty font fixture */",
    }),
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
  await page.route("**/register-sw.js?*", (route) =>
    route.fulfill({ contentType: "text/javascript", body: "" }),
  );
  await page.route(previewStyleUrl, async (route) => {
    if (options.onStyle) await options.onStyle(route);
    else await route.fulfill({ json: options.style ?? localBuildingStyle });
  });
  await page.route("**/api/stops/nearby?**", async (route) => {
    const url = new URL(route.request().url());
    requests.push({ kind: "bus", url });
    if (options.onBus) await options.onBus(route, url);
    else await route.fulfill({ json: { stops: busStops } });
  });
  await page.route("**/api/subway/nearby?**", async (route) => {
    const url = new URL(route.request().url());
    requests.push({ kind: "subway", url });
    if (options.onSubway) await options.onSubway(route, url);
    else await route.fulfill({ json: { stations: subwayStations } });
  });
  return { requests, unexpectedExternalRequests };
}
