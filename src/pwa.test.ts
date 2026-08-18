import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

const ManifestIconSchema = z.object({
  src: z.string().min(1),
  sizes: z.string().min(1),
  type: z.string().min(1),
  purpose: z.string().min(1),
});

const WebManifestSchema = z.object({
  id: z.literal("/"),
  name: z.string().min(1),
  short_name: z.string().min(1),
  description: z.string().min(1),
  lang: z.literal("ko-KR"),
  start_url: z.literal("/"),
  scope: z.literal("/"),
  display: z.literal("standalone"),
  theme_color: z.string().regex(/^#[0-9a-f]{6}$/i),
  background_color: z.string().regex(/^#[0-9a-f]{6}$/i),
  icons: z.array(ManifestIconSchema).min(1),
});

describe("PWA assets", () => {
  it("declares an installable standalone application manifest", async () => {
    const manifestUrl = new URL("../public/manifest.webmanifest", import.meta.url);
    const manifestText = await readFile(manifestUrl, "utf8");

    const manifest = WebManifestSchema.parse(JSON.parse(manifestText));

    expect(
      manifest.icons.some(
        (icon) =>
          icon.type === "image/svg+xml" &&
          icon.sizes === "any" &&
          icon.purpose.split(" ").includes("maskable"),
      ),
    ).toBe(true);
  });

  it("registers the offline worker after the page loads", async () => {
    const scriptUrl = new URL("../public/register-sw.js", import.meta.url);
    const script = await readFile(scriptUrl, "utf8");
    const loadCallbacks: Array<() => void> = [];
    const register = vi.fn().mockResolvedValue({});

    runInNewContext(script, {
      navigator: { serviceWorker: { register } },
      window: {
        addEventListener: (type: string, callback: () => void) => {
          if (type === "load") {
            loadCallbacks.push(callback);
          }
        },
      },
    });
    loadCallbacks.forEach((callback) => {
      callback();
    });

    expect(register).toHaveBeenCalledWith("/sw.js");
  });

  it("installs lifecycle handlers for offline navigation", async () => {
    const workerUrl = new URL("../public/sw.js", import.meta.url);
    const worker = await readFile(workerUrl, "utf8");
    const registeredEvents: string[] = [];

    runInNewContext(worker, {
      self: {
        location: { origin: "https://bus.m16khb.xyz" },
        addEventListener: (type: string) => registeredEvents.push(type),
      },
    });

    expect(registeredEvents).toEqual(["install", "activate", "fetch"]);
  });
});
