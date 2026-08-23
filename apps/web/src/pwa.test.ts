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
      manifest.icons.some((icon) =>
        icon.purpose.split(" ").includes("maskable"),
      ),
    ).toBe(true);
  });

  it("provides raster icons required by Samsung Internet", async () => {
    const manifestUrl = new URL("../public/manifest.webmanifest", import.meta.url);
    const manifestText = await readFile(manifestUrl, "utf8");
    const manifest = WebManifestSchema.parse(JSON.parse(manifestText));

    for (const size of ["192x192", "512x512"]) {
      const icon = manifest.icons.find(
        (candidate) => candidate.type === "image/png" && candidate.sizes === size,
      );
      expect(icon, `missing ${size} PNG manifest icon`).toBeDefined();
      if (!icon) {
        throw new Error(`Missing ${size} PNG manifest icon`);
      }

      const iconUrl = new URL(`../public${icon.src}`, import.meta.url);
      const png = await readFile(iconUrl);
      const [expectedWidth, expectedHeight] = size.split("x").map(Number);
      expect(png.subarray(1, 4).toString("ascii")).toBe("PNG");
      expect(png.readUInt32BE(16)).toBe(expectedWidth);
      expect(png.readUInt32BE(20)).toBe(expectedHeight);
    }
  });

  it("omits orientation so the installed app follows the device rotation setting", async () => {
    const manifestUrl = new URL("../public/manifest.webmanifest", import.meta.url);
    const manifestText = await readFile(manifestUrl, "utf8");

    expect(
      "orientation" in JSON.parse(manifestText),
      "manifest orientation overrides the OS rotation lock (chromium issues/40880635)",
    ).toBe(false);
  });

  it("registers the offline worker after the page loads", async () => {
    const scriptUrl = new URL("../public/register-sw.js", import.meta.url);
    const script = await readFile(scriptUrl, "utf8");
    const loadCallbacks: Array<() => void> = [];
    const registeredWindowEvents: string[] = [];
    const register = vi.fn().mockResolvedValue({});

    runInNewContext(script, {
      navigator: { serviceWorker: { register } },
      window: {
        addEventListener: (type: string, callback: () => void) => {
          registeredWindowEvents.push(type);
          if (type === "load") {
            loadCallbacks.push(callback);
          }
        },
      },
    });
    loadCallbacks.forEach((callback) => {
      callback();
    });

    expect(register).toHaveBeenCalledWith("/sw.js?v=6");
    expect(registeredWindowEvents).toEqual(["load"]);
  });

  it("keeps service-worker shell version consistent across assets", async () => {
    const readRepoFile = async (relative: string) =>
      readFile(new URL(relative, import.meta.url), "utf8");

    const html = await readRepoFile("../index.html");
    const register = await readRepoFile("../public/register-sw.js");
    const worker = await readRepoFile("../public/sw.js");

    const htmlVersion = html.match(/register-sw\.js\?v=(\d+)/)?.[1];
    const registeredVersion = register.match(/sw\.js\?v=(\d+)/)?.[1];
    const shellVersion = worker.match(/(?:commute-bus|mota)-shell-v(\d+)/)?.[1];
    const precachedRegister = worker.match(/register-sw\.js\?v=(\d+)/)?.[1];

    expect(
      new Set([
        htmlVersion,
        registeredVersion,
        shellVersion,
        precachedRegister,
      ]).size,
      "shell version must match in index.html, register-sw.js, and sw.js",
    ).toBe(1);
  });

  it("installs lifecycle handlers for offline navigation", async () => {
    const workerUrl = new URL("../public/sw.js", import.meta.url);
    const worker = await readFile(workerUrl, "utf8");
    const registeredEvents: string[] = [];

    runInNewContext(worker, {
      self: {
        location: { origin: "https://mota.m16khb.xyz" },
        addEventListener: (type: string) => registeredEvents.push(type),
      },
    });

    expect(registeredEvents).toEqual(["install", "activate", "fetch"]);
  });
});
