import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
	MAP_PREVIEW_BOUNDS,
	MAP_PREVIEW_BUILDING_LAYER_ID,
	MAP_PREVIEW_CONTROL_LOCALE,
	MAP_PREVIEW_INITIAL_CAMERA,
	MAP_PREVIEW_MOTION_POLICY,
	MAP_PREVIEW_PITCH_LIMITS,
	MAP_PREVIEW_SOURCE_ID,
	MAP_PREVIEW_STYLE_URL,
	MAP_PREVIEW_ZOOM_LIMITS,
} from "./mapPreviewConfig";

const source = readFileSync(
	new URL("./mapPreviewConfig.ts", import.meta.url),
	"utf8",
);

describe("mapPreviewConfig provider contract", () => {
	it("exposes the public OpenFreeMap Liberty style URL, never inline style JSON", () => {
		expect(MAP_PREVIEW_STYLE_URL).toBe(
			"https://tiles.openfreemap.org/styles/liberty",
		);
		expect(source).not.toMatch(/"version"\s*:\s*8|"sources"\s*:/);
	});

	it("uses the Liberty openmaptiles source and building-3d layer ids", () => {
		expect(MAP_PREVIEW_SOURCE_ID).toBe("openmaptiles");
		expect(MAP_PREVIEW_BUILDING_LAYER_ID).toBe("building-3d");
	});

	it("selects the Korean control locale", () => {
		expect(MAP_PREVIEW_CONTROL_LOCALE).toEqual({
			"NavigationControl.ZoomIn": "확대",
			"NavigationControl.ZoomOut": "축소",
			"NavigationControl.ResetBearing":
				"드래그하여 지도를 회전하고 클릭하여 북쪽으로 재설정",
		});
	});
});

describe("mapPreviewConfig camera contract", () => {
	it("starts at the Seoul longitude-first [lng, lat] center with zoom 15, pitch 42, bearing -20", () => {
		expect(MAP_PREVIEW_INITIAL_CAMERA.center).toEqual([127.1253, 37.5366]);
		// adversarial: swapped axes would put latitude (~37) first
		expect(MAP_PREVIEW_INITIAL_CAMERA.center[0]).toBeGreaterThan(
			MAP_PREVIEW_INITIAL_CAMERA.center[1],
		);
		expect(MAP_PREVIEW_INITIAL_CAMERA.zoom).toBe(15);
		expect(MAP_PREVIEW_INITIAL_CAMERA.pitch).toBe(42);
		expect(MAP_PREVIEW_INITIAL_CAMERA.bearing).toBe(-20);
	});

	it("clamps zoom to 11-19 and pitch to 0-60 with no padding", () => {
		expect(MAP_PREVIEW_ZOOM_LIMITS).toEqual({ min: 11, max: 19 });
		expect(MAP_PREVIEW_PITCH_LIMITS).toEqual({ min: 0, max: 60 });
		// adversarial: a pitch ceiling above 60 drifts past the API-valid range
		expect(MAP_PREVIEW_PITCH_LIMITS.max).toBeLessThanOrEqual(60);
		expect(MAP_PREVIEW_ZOOM_LIMITS.min).toBeLessThan(
			MAP_PREVIEW_INITIAL_CAMERA.zoom,
		);
		expect(MAP_PREVIEW_INITIAL_CAMERA.zoom).toBeLessThan(
			MAP_PREVIEW_ZOOM_LIMITS.max,
		);
		expect(MAP_PREVIEW_PITCH_LIMITS.min).toBeLessThan(
			MAP_PREVIEW_INITIAL_CAMERA.pitch,
		);
		expect(MAP_PREVIEW_INITIAL_CAMERA.pitch).toBeLessThan(
			MAP_PREVIEW_PITCH_LIMITS.max,
		);
	});

	it("keeps the exact API-valid bounds SW [126.7, 37.3] / NE [127.3, 37.8]", () => {
		expect(MAP_PREVIEW_BOUNDS).toEqual([
			[126.7, 37.3],
			[127.3, 37.8],
		]);
		// adversarial: Leaflet pad()/fitBounds padding would move the corners
		expect(MAP_PREVIEW_BOUNDS[0][0]).toBe(126.7);
		expect(MAP_PREVIEW_BOUNDS[0][1]).toBe(37.3);
		expect(MAP_PREVIEW_BOUNDS[1][0]).toBe(127.3);
		expect(MAP_PREVIEW_BOUNDS[1][1]).toBe(37.8);
		const [southWest, northEast] = MAP_PREVIEW_BOUNDS;
		expect(southWest[0]).toBeLessThan(northEast[0]);
		expect(southWest[1]).toBeLessThan(northEast[1]);
	});

	it("starts inside the API-valid bounds with matching coordinate order", () => {
		const [[swLng, swLat], [neLng, neLat]] = MAP_PREVIEW_BOUNDS;
		const [lng, lat] = MAP_PREVIEW_INITIAL_CAMERA.center;
		expect(lng).toBeGreaterThanOrEqual(swLng);
		expect(lng).toBeLessThanOrEqual(neLng);
		expect(lat).toBeGreaterThanOrEqual(swLat);
		expect(lat).toBeLessThanOrEqual(neLat);
	});
});

describe("mapPreviewConfig motion policy", () => {
	it("leaves MapLibre reduceMotion undefined so the device preference controls motion", () => {
		expect(MAP_PREVIEW_MOTION_POLICY).toEqual({ reduceMotion: undefined });
		// adversarial: stale external assumptions about the MapLibre API surface
		expect(source).not.toMatch(/respectPrefersReducedMotion\s*:/);
	});
});

describe("mapPreviewConfig immutability and isolation", () => {
	it("deep-freezes every exported constant", () => {
		expect(Object.isFrozen(MAP_PREVIEW_CONTROL_LOCALE)).toBe(true);
		expect(Object.isFrozen(MAP_PREVIEW_INITIAL_CAMERA)).toBe(true);
		expect(Object.isFrozen(MAP_PREVIEW_INITIAL_CAMERA.center)).toBe(true);
		expect(Object.isFrozen(MAP_PREVIEW_BOUNDS)).toBe(true);
		for (const corner of MAP_PREVIEW_BOUNDS) {
			expect(Object.isFrozen(corner)).toBe(true);
		}
		expect(Object.isFrozen(MAP_PREVIEW_ZOOM_LIMITS)).toBe(true);
		expect(Object.isFrozen(MAP_PREVIEW_PITCH_LIMITS)).toBe(true);
		expect(Object.isFrozen(MAP_PREVIEW_MOTION_POLICY)).toBe(true);
	});

	it("rejects mutation attempts and keeps the original machine values", () => {
		expect(() => {
			(
				MAP_PREVIEW_CONTROL_LOCALE as Record<string, string>
			)["NavigationControl.ZoomIn"] = "Zoom in";
		}).toThrow(TypeError);
		expect(MAP_PREVIEW_CONTROL_LOCALE["NavigationControl.ZoomIn"]).toBe("확대");
		expect(() => {
			(MAP_PREVIEW_INITIAL_CAMERA.center as unknown as number[])[0] = 37.5366;
		}).toThrow(TypeError);
		expect(MAP_PREVIEW_INITIAL_CAMERA.center[0]).toBe(127.1253);
		const mutableCorner = MAP_PREVIEW_BOUNDS[0] as unknown as number[];
		expect(() => {
			mutableCorner[1] = 99;
		}).toThrow(TypeError);
		expect(MAP_PREVIEW_BOUNDS[0][1]).toBe(37.3);
		expect(() => {
			(
				MAP_PREVIEW_MOTION_POLICY as { reduceMotion: boolean | undefined }
			).reduceMotion = false;
		}).toThrow(TypeError);
		expect(MAP_PREVIEW_MOTION_POLICY.reduceMotion).toBeUndefined();
	});

	it("avoids shared-contract imports, storage access, and copied style JSON", () => {
		expect(source).not.toMatch(
			/from\s+["'](?:@mota\/contracts(?:\/[^"']*)?|(?:[^"']*\/)?packages\/contracts(?:\/[^"']*)?)["']/,
		);
		expect(source).not.toMatch(/localStorage|sessionStorage|indexedDB/);
		expect(source).not.toMatch(/"layers"\s*:/);
	});
});
