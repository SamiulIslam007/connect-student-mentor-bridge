import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

/**
 * The request-id middleware is applied by an explicit controller list, so a new
 * module can register a controller that silently gets no `X-Request-Id` and
 * cannot correlate its audit rows. Four controllers were missing that way
 * (D-154); this test reads both files and fails on the next omission.
 */
const SRC = join(import.meta.dirname, "..", "src");

function registeredControllers(): string[] {
  const names: string[] = [];
  for (const entry of readdirSync(SRC, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }
    for (const file of readdirSync(join(SRC, entry.name))) {
      if (!file.endsWith(".module.ts")) {
        continue;
      }
      const text = readFileSync(join(SRC, entry.name, file), "utf8");
      const match = /controllers:\s*\[([^\]]*)\]/.exec(text);
      if (!match) {
        continue;
      }
      for (const name of match[1].split(",")) {
        const trimmed = name.trim();
        if (trimmed !== "") {
          names.push(trimmed);
        }
      }
    }
  }
  return names;
}

function middlewareRoutes(): string {
  const text = readFileSync(join(SRC, "app.module.ts"), "utf8");
  const start = text.indexOf(".forRoutes(");
  assert.ok(start > 0, "app.module.ts applies the request-id middleware");
  return text.slice(start, text.indexOf(");", start));
}

test("every registered controller carries the request-id middleware", () => {
  const controllers = registeredControllers();
  assert.ok(controllers.length > 15, `found ${controllers.length} controllers`);
  const routes = middlewareRoutes();
  const missing = controllers.filter((name) => !routes.includes(name));
  assert.deepEqual(missing, [], "add every missing controller to app.module.ts forRoutes");
});
