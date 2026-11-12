import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import manifest, { manifestColors } from "../app/manifest.js";
import { strings } from "../lib/strings.js";

const webRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const publicDir = join(webRoot, "public");

/** Read width and height from a PNG's IHDR chunk (bytes 16 and 20 after the 8-byte signature). */
function pngSize(path: string): { width: number; height: number } {
  const file = readFileSync(path);
  assert.equal(
    file.subarray(0, 8).toString("hex"),
    "89504e470d0a1a0a",
    `${path} is not a PNG`,
  );
  return { width: file.readUInt32BE(16), height: file.readUInt32BE(20) };
}

test("the manifest declares the install identity", () => {
  const value = manifest();

  assert.equal(value.name, strings.appName);
  assert.equal(value.short_name, strings.appName);
  assert.equal(value.display, "standalone");
  assert.equal(value.background_color, manifestColors.background);
  assert.equal(value.theme_color, manifestColors.theme);
  assert.equal(typeof value.description, "string");
  assert.ok((value.description ?? "").length > 0);

  // A start URL installs from the origin, not from an absolute one.
  assert.match(value.start_url ?? "", /^\/(?!\/)/);
});

test("every declared icon exists under public at the size it claims", () => {
  const icons = manifest().icons ?? [];
  assert.ok(icons.length >= 3);

  for (const icon of icons) {
    assert.equal(icon.type, "image/png");
    const path = join(publicDir, icon.src);
    assert.ok(existsSync(path), `missing icon file ${icon.src}`);

    const match = /^(\d+)x(\d+)$/.exec(icon.sizes ?? "");
    assert.ok(match, `icon ${icon.src} declares no size`);
    const { width, height } = pngSize(path);
    assert.equal(width, Number(match[1]), `${icon.src} width`);
    assert.equal(height, Number(match[2]), `${icon.src} height`);
  }

  const sizes = icons.map((icon) => icon.sizes);
  assert.ok(sizes.includes("192x192"), "no 192 icon");
  assert.ok(sizes.includes("512x512"), "no 512 icon");
  assert.ok(
    icons.some((icon) => (icon.purpose ?? "").includes("maskable")),
    "no maskable icon",
  );
});

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx|js|jsx)$/.test(entry) ? [path] : [];
  });
}

test("no service worker is registered and none ships", () => {
  const files = [
    ...sourceFiles(join(webRoot, "app")),
    ...sourceFiles(join(webRoot, "lib")),
  ];
  for (const file of files) {
    assert.doesNotMatch(
      readFileSync(file, "utf8"),
      /serviceWorker|service-worker/,
      `${file} registers a service worker`,
    );
  }

  for (const candidate of [
    "sw.js",
    "service-worker.js",
    join("app", "sw.js"),
    join("app", "service-worker.ts"),
  ]) {
    assert.equal(
      existsSync(join(webRoot, candidate)),
      false,
      `${candidate} exists`,
    );
  }
  assert.equal(
    existsSync(join(publicDir, "sw.js")),
    false,
    "public/sw.js exists",
  );

  // The manifest itself must not name one either.
  assert.doesNotMatch(JSON.stringify(manifest()), /serviceworker/i);
});
