import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

import { CSRF_EXEMPT_ROUTES } from "../lib/csrf.js";

const APP = path.join(import.meta.dirname, "..", "app");
const WRITE_METHODS = ["POST", "PUT", "PATCH", "DELETE"];

function files(root: string, suffix: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) {
      found.push(...files(full, suffix));
    } else if (entry.name.endsWith(suffix)) {
      found.push(full);
    }
  }
  return found;
}

function source(file: string): string {
  return readFileSync(file, "utf8");
}

function relative(file: string): string {
  return "app/" + path.relative(APP, file).split(path.sep).join("/");
}

const routes = files(path.join(APP, "api"), "route.ts");

test("every write-capable route calls the guard, except the five with no session yet", () => {
  const writeRoutes = routes.filter((file) =>
    WRITE_METHODS.some((method) => new RegExp(`export async function ${method}\\(`).test(source(file))),
  );
  assert.ok(writeRoutes.length >= 30, `expected the write surface, found ${writeRoutes.length}`);

  const unguarded = writeRoutes
    .filter((file) => !CSRF_EXEMPT_ROUTES.includes(relative(file)))
    .filter((file) => !/requireCsrf\(/.test(source(file)))
    .map(relative);

  assert.deepEqual(unguarded, [], "a write route without requireCsrf is a CSRF hole");
});

test("the exemption list is exactly the five documented writes and they carry no guard", () => {
  assert.deepEqual([...CSRF_EXEMPT_ROUTES].sort(), [
    "app/api/auth/forgot-password/route.ts",
    "app/api/auth/register/route.ts",
    "app/api/auth/reset-password/route.ts",
    "app/api/auth/sign-in/provider/route.ts",
    "app/api/auth/sign-in/route.ts",
  ]);

  for (const exempt of CSRF_EXEMPT_ROUTES) {
    const file = routes.find((candidate) => relative(candidate) === exempt);
    assert.ok(file, `${exempt} must exist`);
    assert.equal(
      /requireCsrf\(/.test(source(file as string)),
      false,
      `${exempt} runs before a session exists, so it must not be guarded`,
    );
  }
});

test("sign-out stays guarded: a forced sign-out is a real attack", () => {
  for (const guarded of [
    "app/api/auth/sign-out/route.ts",
    "app/api/auth/sign-out-everywhere/route.ts",
  ]) {
    const file = routes.find((candidate) => relative(candidate) === guarded);
    assert.ok(file, `${guarded} must exist`);
    assert.match(source(file as string), /requireCsrf\(/, `${guarded} must be guarded`);
    assert.equal(CSRF_EXEMPT_ROUTES.includes(guarded), false);
  }
});

test("a read route calls no guard", () => {
  const readOnly = routes.filter(
    (file) =>
      !WRITE_METHODS.some((method) => new RegExp(`export async function ${method}\\(`).test(source(file))) &&
      /export async function GET\(/.test(source(file)),
  );
  assert.ok(readOnly.length > 10, `expected the read surface, found ${readOnly.length}`);
  for (const file of readOnly) {
    assert.equal(/requireCsrf\(/.test(source(file)), false, `${relative(file)} is a read`);
  }
});

/** Every `fetch(...)` call in `text` whose init carries a write method. */
function bareWriteCalls(text: string): number {
  let count = 0;
  for (const match of text.matchAll(/(^|[^\w.])fetch\(/g)) {
    const open = (match.index ?? 0) + match[0].length - 1;
    let depth = 0;
    let end = open;
    for (let i = open; i < text.length; i += 1) {
      if (text[i] === "(") {
        depth += 1;
      } else if (text[i] === ")") {
        depth -= 1;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    if (/method: "(POST|PUT|PATCH|DELETE)"/.test(text.slice(open, end))) {
      count += 1;
    }
  }
  return count;
}

test("every page that writes uses the helper and no page builds an authorization header", () => {
  const pages = files(APP, ".tsx").filter((file) =>
    /method: "(POST|PUT|PATCH|DELETE)"/.test(source(file)),
  );
  assert.ok(pages.length >= 19, `expected the writing pages, found ${pages.length}`);

  for (const page of pages) {
    const text = source(page);
    assert.match(text, /\bcsrfFetch\(/, `${relative(page)} must send its writes through csrfFetch`);
    assert.equal(bareWriteCalls(text), 0, `${relative(page)} still posts with a bare fetch`);
    assert.equal(/\bauthorization\s*:/.test(text), false, `${relative(page)} must not build an auth header`);
  }
});

test("the client helper lives in its own module and adds the header once", () => {
  const helper = source(path.join(import.meta.dirname, "..", "lib", "csrf-client.ts"));
  assert.match(helper, /export const CSRF_HEADER_NAME = "x-csrf-token"/);
  assert.match(helper, /export async function csrfFetch/);
  assert.equal(/next\/server/.test(helper), false, "the client half must not import a server module");
});
