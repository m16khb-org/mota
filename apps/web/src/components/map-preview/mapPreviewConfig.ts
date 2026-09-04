/**
 * Camera and provider contract for the `/3d-preview` MapLibre preview.
 *
 * Single source of truth for preview camera/provider values. These constants
 * stay out of shared contracts and storage: only the preview chunk consumes
 * them. The OpenFreeMap Liberty style JSON is loaded from its public URL at
 * runtime and is never copied into this repository.
 */

import type { MapOptions } from "maplibre-gl";

/**
 * MapLibre `[lng, lat]` coordinate order, matching `LngLatLike`.
 */
export type LngLat = readonly [lng: number, lat: number];

/**
 * `[[southwestLng, southwestLat], [northeastLng, northeastLat]]`,
 * directly usable as a MapLibre `LngLatBoundsLike`.
 */
export type LngLatBoundsPair = readonly [southWest: LngLat, northEast: LngLat];

export interface MapPreviewCamera {
	readonly center: LngLat;
	readonly zoom: number;
	readonly pitch: number;
	readonly bearing: number;
}

export interface MapPreviewRange {
	readonly min: number;
	readonly max: number;
}

export type MapPreviewMotionPolicy = Readonly<
	Pick<MapOptions, "reduceMotion">
>;

/** Public OpenFreeMap Liberty style URL (not an inlined style JSON). */
export const MAP_PREVIEW_STYLE_URL =
	"https://tiles.openfreemap.org/styles/liberty" as const;

/** `sources` key of the Liberty style that carries the vector tiles. */
export const MAP_PREVIEW_SOURCE_ID = "openmaptiles" as const;

/** 3D buildings fill-extrusion layer id added on top of the Liberty style. */
export const MAP_PREVIEW_BUILDING_LAYER_ID = "building-3d" as const;

/** Korean locale patch passed to MapLibre navigation controls. */
export const MAP_PREVIEW_CONTROL_LOCALE = Object.freeze({
	"NavigationControl.ZoomIn": "확대",
	"NavigationControl.ZoomOut": "축소",
	"NavigationControl.ResetBearing":
		"드래그하여 지도를 회전하고 클릭하여 북쪽으로 재설정",
}) satisfies Readonly<NonNullable<MapOptions["locale"]>>;

/** Initial preview camera over the Seoul area. */
export const MAP_PREVIEW_INITIAL_CAMERA: MapPreviewCamera = Object.freeze({
	center: Object.freeze([127.1253, 37.5366] as const),
	zoom: 15,
	pitch: 42,
	bearing: -20,
});

/** API-valid preview bounds, SW corner then NE corner (`LngLatBoundsLike`). */
export const MAP_PREVIEW_BOUNDS: LngLatBoundsPair = Object.freeze([
	Object.freeze([126.7, 37.3] as const),
	Object.freeze([127.3, 37.8] as const),
]);

/** Allowed camera zoom range for the preview. */
export const MAP_PREVIEW_ZOOM_LIMITS: MapPreviewRange = Object.freeze({
	min: 11,
	max: 19,
});

/** Allowed camera pitch range for the preview. */
export const MAP_PREVIEW_PITCH_LIMITS: MapPreviewRange = Object.freeze({
	min: 0,
	max: 60,
});

/** Let MapLibre derive reduced motion from the user's device preference. */
export const MAP_PREVIEW_MOTION_POLICY: MapPreviewMotionPolicy = Object.freeze({
	reduceMotion: undefined,
});
