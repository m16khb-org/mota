/** @vitest-environment jsdom */
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InstallPrompt } from "./InstallPrompt";

const originalUserAgent = navigator.userAgent;

const setUserAgent = (userAgent: string) => {
  Object.defineProperty(navigator, "userAgent", {
    configurable: true,
    value: userAgent,
  });
};

afterEach(() => {
  Reflect.deleteProperty(window, "__installPrompt");
  setUserAgent(originalUserAgent);
  vi.restoreAllMocks();
});

describe("InstallPrompt", () => {
  it("opens the native PWA prompt from a visible install button", async () => {
    const prompt = vi.fn().mockResolvedValue(undefined);
    const installEvent = Object.assign(new Event("beforeinstallprompt"), {
      prompt,
      userChoice: Promise.resolve({
        outcome: "accepted" as const,
        platform: "web",
      }),
    });

    render(<InstallPrompt />);
    window.dispatchEvent(installEvent);

    fireEvent.click(await screen.findByRole("button", { name: "앱 설치" }));

    expect(prompt).toHaveBeenCalledOnce();
  });

  it("uses an install event captured before React mounts", async () => {
    const prompt = vi.fn().mockResolvedValue(undefined);
    const installEvent = Object.assign(new Event("beforeinstallprompt"), {
      prompt,
      userChoice: Promise.resolve({
        outcome: "accepted" as const,
        platform: "web",
      }),
    });
    Object.assign(window, { __installPrompt: installEvent });

    render(<InstallPrompt />);
    fireEvent.click(await screen.findByRole("button", { name: "앱 설치" }));

    expect(prompt).toHaveBeenCalledOnce();
  });

  it("shows Samsung Internet install guidance when no prompt event arrives", () => {
    setUserAgent(
      "Mozilla/5.0 (Linux; Android 14; SAMSUNG SM-S928N) AppleWebKit/537.36 SamsungBrowser/28.0 Chrome/130.0 Mobile Safari/537.36",
    );

    render(<InstallPrompt />);
    fireEvent.click(screen.getByRole("button", { name: "앱 설치" }));

    expect(
      screen.getByText("브라우저 메뉴에서 앱 화면에 설치를 선택해 주세요."),
    ).toBeVisible();
  });
});
