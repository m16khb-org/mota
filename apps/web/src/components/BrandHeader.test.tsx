// @vitest-environment jsdom

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
  });
});
