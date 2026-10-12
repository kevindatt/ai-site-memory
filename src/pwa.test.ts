import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import manifestRaw from "../public/manifest.webmanifest?raw";
import swRaw from "../public/sw.js?raw";

function pngSize(bytes: Uint8Array): { width: number; height: number } {
  const view = new DataView(bytes.buffer, bytes.byteOffset);
  expect([...bytes.slice(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

describe("PWA readiness (automated checks)", () => {
  it("ships a valid installable manifest", () => {
    const manifest = JSON.parse(manifestRaw) as {
      name: string;
      short_name: string;
      start_url: string;
      scope: string;
      display: string;
      theme_color: string;
      icons: Array<{ sizes: string; purpose?: string }>;
    };
    expect(manifest.name).toContain("AI Site Memory");
    expect(manifest.short_name).toBeTruthy();
    expect(manifest.start_url).toBe("/");
    expect(manifest.scope).toBe("/");
    expect(manifest.display).toBe("standalone");
    expect(manifest.theme_color).toBe("#102a43");
    const sizes = manifest.icons.map((icon) => icon.sizes);
    expect(sizes).toContain("192x192");
    expect(sizes).toContain("512x512");
    expect(manifest.icons.some((icon) => icon.purpose === "maskable")).toBe(true);
  });

  it("ships real 192/512 PNG icons", () => {
    const files = [
      ["public/icons/icon-192.png", 192],
      ["public/icons/icon-512.png", 512],
      ["public/icons/icon-maskable-512.png", 512]
    ] as const;
    for (const [file, size] of files) {
      const bytes = new Uint8Array(readFileSync(file));
      expect(bytes.length).toBeGreaterThan(500);
      expect(pngSize(bytes)).toEqual({ width: size, height: size });
    }
  });

  it("service worker caches the versioned app shell only", () => {
    expect(swRaw).toContain("asm-shell-v");
    expect(swRaw).toContain("skipWaiting");
    expect(swRaw).toContain("/manifest.webmanifest");
    expect(swRaw).toContain("/icons/");
    // Privacy guardrails are documented in the worker itself.
    expect(swRaw).toContain("NEVER");
    expect(swRaw).toContain("document");
    // Every cache write goes through the single versioned cache name.
    const writes = swRaw.match(/caches\.open\(([^)]+)\)/g) ?? [];
    expect(writes.length).toBeGreaterThan(0);
    for (const write of writes) {
      expect(write).toContain("CACHE_VERSION");
    }
  });
});
