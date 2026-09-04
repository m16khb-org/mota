import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const styles = readFileSync(
	resolve(process.cwd(), "src/components/map-preview/MapPreviewPage.css"),
	"utf8",
);

describe("live 3D map visual contract", () => {
	it("keeps the viewport bounded with a 420px desktop control rail", () => {
		expect(styles).toMatch(/\.map-preview-page\s*\{[^}]*block-size:\s*100dvh[^}]*overflow:\s*hidden/s);
		expect(styles).toMatch(/@media \(min-width:\s*960px\)[\s\S]*grid-template-columns:\s*420px minmax\(0, 1fr\)/);
		expect(styles).toMatch(/\.map-preview-rail\s*\{[^}]*overflow-y:\s*auto/s);
		expect(styles).toMatch(/\[data-testid="maplibre-preview-map"\]\s*\{[^}]*block-size:\s*100%/s);
	});

	it("uses the black, white, lime operations-board hierarchy", () => {
		expect(styles).toMatch(/\.map-preview-rail\s*\{[^}]*background:\s*var\(--ink\)/s);
		expect(styles).toMatch(/\.map-preview-live__status span\s*\{[^}]*background:\s*var\(--signal\)/s);
		expect(styles).toMatch(/\.map-preview-mode\[aria-pressed="true"\]\s*\{[^}]*background:\s*var\(--signal\)/s);
		expect(styles).not.toMatch(/(?:linear|radial)-gradient|backdrop-filter/);
	});

	it("keeps controls touch-sized, numeric states tabular, and focus visible", () => {
		expect(styles).toMatch(/\.map-preview-mode\s*\{[^}]*min-block-size:\s*44px/s);
		expect(styles).toMatch(/\.map-preview-point-list button\s*\{[^}]*min-block-size:\s*44px/s);
		expect(styles).toContain("font-variant-numeric: tabular-nums");
		expect(styles).toMatch(/:focus-visible\s*\{[^}]*outline:\s*3px/s);
	});

	it("stacks map and independently scrolling sheet on narrow screens", () => {
		expect(styles).toMatch(/grid-template-areas:\s*"map"\s*"rail"/s);
		expect(styles).toMatch(/grid-template-rows:\s*minmax\(280px, 52dvh\) minmax\(0, 1fr\)/);
		expect(styles).toMatch(/@media \(max-width:\s*420px\)/);
		expect(styles).toMatch(/@media \(prefers-reduced-motion:\s*reduce\)[\s\S]*transition-duration:\s*1ms/);
	});
});
