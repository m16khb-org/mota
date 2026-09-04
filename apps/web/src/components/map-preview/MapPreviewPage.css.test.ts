import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const previewStyles = readFileSync(
	resolve(process.cwd(), "src/components/map-preview/MapPreviewPage.css"),
	"utf8",
);
const appStyles = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");

describe("3D preview responsive style contract", () => {
	it("uses the canonical Korean metadata and title tracking", () => {
		expect(previewStyles).toMatch(
			/\.map-preview-eyebrow\s*\{[^}]*letter-spacing:\s*0\.05em/s,
		);
		expect(previewStyles).toMatch(
			/\.map-preview-header h1\s*\{[^}]*letter-spacing:\s*0(?:;|\s)/s,
		);
	});

	it("keeps the preview shell bounded and gives the map a real block size", () => {
		expect(previewStyles).toMatch(
			/\.map-preview-page\s*\{[^}]*block-size:\s*100dvh[^}]*overflow:\s*hidden/s,
		);
		expect(previewStyles).toMatch(
			/\[data-testid="maplibre-preview-map"\]\s*\{[^}]*block-size:\s*100%/s,
		);
		expect(previewStyles).toMatch(
			/@media \(min-width:\s*960px\)[\s\S]*grid-template-columns:\s*420px minmax\(0, 1fr\)/,
		);
		expect(previewStyles).toContain("min-inline-size: 0");
	});

	it("preserves 44px MapLibre controls, readable attribution, and scrolling list alternatives", () => {
		expect(previewStyles).toMatch(
			/\.map-preview-map \.maplibregl-ctrl-group button\s*\{[^}]*min-inline-size:\s*44px[^}]*min-block-size:\s*44px/s,
		);
		expect(previewStyles).toMatch(
			/\.map-preview-map \.maplibregl-ctrl-attrib\s*\{[^}]*visibility:\s*visible/s,
		);
		expect(previewStyles).toMatch(
			/\.map-preview-points\s*\{[^}]*overflow-y:\s*auto/s,
		);
		expect(previewStyles).toMatch(
			/\.map-preview-point-list button\s*\{[^}]*min-block-size:\s*44px/s,
		);
	});

	it("distinguishes bus and subway markers by shape and exposes keyboard focus", () => {
		expect(previewStyles).toMatch(
			/\.map-preview-marker--bus::before\s*\{[^}]*border-radius:\s*50%/s,
		);
		expect(previewStyles).toMatch(
			/\.map-preview-marker--subway::before\s*\{[^}]*transform:\s*[^;}]*rotate\(45deg\)/s,
		);
		expect(previewStyles).toMatch(
			/\.map-preview-marker:focus-visible\s*\{[^}]*outline:\s*3px/s,
		);
		expect(previewStyles).toMatch(
			/\.map-preview-point-list summary:focus-visible,[\s\S]*\.map-preview-point-list button:focus-visible\s*\{[^}]*outline:\s*3px/s,
		);
	});

	it("wraps long content and removes non-essential motion at narrow or zoomed layouts", () => {
		expect(previewStyles).toMatch(/@media \(max-width:\s*959\.98px\)/);
		expect(previewStyles).toContain("overflow-wrap: anywhere");
		expect(previewStyles).toMatch(
			/@media \(prefers-reduced-motion:\s*reduce\)[\s\S]*transition-duration:\s*1ms/,
		);
	});

	it("styles only the existing same-tab preview launcher in the app stylesheet", () => {
		expect(appStyles).toMatch(
			/\.transit-3d-preview-link\s*\{[^}]*min-block-size:\s*44px/s,
		);
		expect(appStyles).not.toMatch(/\.map-preview-(?:page|map|points)/);
	});
});
