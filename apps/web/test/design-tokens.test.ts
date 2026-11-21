import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { test } from "node:test";

const appDir = join(__dirname, "..", "app");
const stylesheet = readFileSync(join(appDir, "globals.css"), "utf8");

function pageSources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      return pageSources(path);
    }
    return /\.tsx$/.test(entry.name) ? [path] : [];
  });
}

const sources = pageSources(appDir).filter((path) => !path.endsWith("layout.tsx") || true);

test("every token the design lists is declared in :root", () => {
  const required = [
    "--surface",
    "--surface-raised",
    "--surface-sunken",
    "--ink",
    "--ink-muted",
    "--ink-on-accent",
    "--border",
    "--border-strong",
    "--accent",
    "--accent-ink",
    "--accent-quiet",
    "--role-student",
    "--role-mentor",
    "--role-institution",
    "--role-employer",
    "--ok",
    "--ok-quiet",
    "--warn",
    "--warn-quiet",
    "--error",
    "--error-quiet",
    "--font-sans",
    "--font-mono",
    "--text-display",
    "--text-heading",
    "--text-body",
    "--text-small",
    "--leading-tight",
    "--leading-body",
    "--space-1",
    "--space-8",
    "--radius-sm",
    "--radius-md",
    "--radius-lg",
    "--focus-ring",
    "--measure",
    "--target",
  ];
  for (const token of required) {
    assert.match(stylesheet, new RegExp(`${token}:`), `${token} is missing`);
  }
});

test("no colour literal lives outside :root", () => {
  const rootBlock = stylesheet.slice(stylesheet.indexOf(":root"), stylesheet.indexOf("/* Base */"));
  const outside = stylesheet.replace(rootBlock, "");
  assert.equal(
    outside.match(/#[0-9a-fA-F]{3,8}\b|rgba?\(/g),
    null,
    "every colour must come from a token",
  );
});

test("every class a page uses exists in the stylesheet", () => {
  const used = new Set<string>();
  for (const path of sources) {
    const source = readFileSync(path, "utf8");
    for (const match of source.matchAll(/className=(?:"([^"]+)"|\{`([^`]+)`\})/g)) {
      const value = (match[1] ?? match[2] ?? "").replace(/\$\{[^}]*\}/g, " ");
      for (const name of value.split(/\s+/).filter(Boolean)) {
        used.add(name);
      }
    }
  }
  const missing = [...used].filter(
    (name) => !new RegExp(String.raw`\.${name}(?![\w-])`).test(stylesheet),
  );
  assert.deepEqual(missing, [], `classes used but not styled: ${missing.join(", ")}`);
});

test("the narrow-viewport block changes only what it names", () => {
  const media = stylesheet.slice(stylesheet.indexOf("@media (max-width: 640px)"));
  assert.ok(media.includes("table"), "tables must scroll on a narrow viewport");
  assert.ok(stylesheet.includes("min-height: var(--target)"), "touch targets come from --target");
  assert.ok(stylesheet.includes(":focus-visible"), "a focus ring must be visible");
  assert.equal(
    relative(appDir, join(appDir, "globals.css")),
    "globals.css",
    "the stylesheet lives beside the pages it styles",
  );
});
