// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BrandHeader } from "./BrandHeader";

vi.mock("./GoogleLogin", () => ({
  GoogleLogin: () => null,
}));

describe("BrandHeader", () => {
  it("uses the same icon asset as the installed app", () => {
    const { container } = render(
      <BrandHeader
        session={{
          authenticated: false,
          checked: true,
          user: null,
          error: null,
        }}
        syncStatus="local"
      />,
    );

    const icon = container.querySelector<HTMLImageElement>(
      ".brand-mark img",
    );
    expect(icon).toHaveAttribute("src", "/pwa-icon.svg");
    expect(icon).toHaveAttribute("width", "48");
    expect(icon).toHaveAttribute("height", "48");
    expect(
      container.querySelector(".brand-mark .lucide-clock-3"),
    ).not.toBeInTheDocument();

    const styles = readFileSync(
      resolve(process.cwd(), "src/styles.css"),
      "utf8",
    );
    const brandRules = [...styles.matchAll(/\.brand-mark\s*{([^}]*)}/g)].map(
      ([, declarations]) => declarations ?? "",
    );
    expect(styles).toContain("--brand-mark-size: 48px");
    expect(styles).toContain("width: var(--brand-mark-size)");
    expect(styles).toContain("height: var(--brand-mark-size)");
    expect(styles).toContain("flex: 0 0 var(--brand-mark-size)");
    expect(
      brandRules.some((rule) =>
        /\b(?:width|height):\s*(?:40|42|44)px/.test(rule),
      ),
    ).toBe(false);
  });
});
