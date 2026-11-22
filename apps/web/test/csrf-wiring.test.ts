import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, test } from "node:test";

import {
  POST as postMentorship,
  PUT as putMentorship,
} from "../app/api/mentorships/[[...path]]/route.js";
import { POST as postSession } from "../app/api/sessions/[[...path]]/route.js";
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

/**
 * SEC-AUDIT-021: the mentorship page drove six writes through a local `post()`
 * with a bare `fetch`, so all six answered 403 under enforcement.
 */
const MENTORSHIP_WRITES = [
  { name: "complete", route: "mentorships", handler: postMentorship, method: "POST", segments: ["m1", "complete"] },
  { name: "agreement save", route: "mentorships", handler: putMentorship, method: "PUT", segments: ["m1", "agreement"] },
  {
    name: "agreement acknowledge",
    route: "mentorships",
    handler: postMentorship,
    method: "POST",
    segments: ["m1", "agreement", "acknowledge"],
  },
  { name: "session create", route: "mentorships", handler: postMentorship, method: "POST", segments: ["m1", "sessions"] },
  { name: "confirm-held", route: "sessions", handler: postSession, method: "POST", segments: ["s1", "confirm-held"] },
  { name: "cancel", route: "sessions", handler: postSession, method: "POST", segments: ["s1", "cancel"] },
] as const;

type Write = (typeof MENTORSHIP_WRITES)[number];

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function stubUpstream(): string[] {
  const calls: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    calls.push(String(input));
    return new Response(JSON.stringify({ status: "accepted" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  return calls;
}

function writeRequest(write: Write, csrf: boolean): Request {
  const path = write.segments.join("/");
  return new Request(`http://localhost:3000/api/${write.route}/${path}`, {
    method: write.method,
    headers: {
      "content-type": "application/json",
      cookie: `connect_session=opaque-session-token${csrf ? "; connect_csrf=a-token" : ""}`,
      ...(csrf ? { "x-csrf-token": "a-token" } : {}),
    },
    body: JSON.stringify({}),
  });
}

for (const write of MENTORSHIP_WRITES) {
  test(`${write.name} answers 403 CSRF_INVALID without a token`, async () => {
    const calls = stubUpstream();

    const response = await write.handler(writeRequest(write, false), {
      params: Promise.resolve({ path: [...write.segments] }),
    });
    const payload = (await response.json()) as { code?: string };

    assert.equal(response.status, 403);
    assert.equal(payload.code, "CSRF_INVALID");
    assert.deepEqual(calls, [], "a refused write never reaches the API");
  });

  test(`${write.name} reaches the API with a token`, async () => {
    const calls = stubUpstream();

    const response = await write.handler(writeRequest(write, true), {
      params: Promise.resolve({ path: [...write.segments] }),
    });

    assert.equal(response.status, 200);
    assert.equal(calls.length, 1);
  });
}

test("the mentorship page's post helper sends every action through csrfFetch", () => {
  const page = source(path.join(APP, "mentorship", "[id]", "page.tsx"));
  const start = page.indexOf("async function post(");
  const end = page.indexOf("async function send(");
  assert.ok(start > 0 && end > start, "the post helper exists");

  const helper = page.slice(start, end);
  assert.match(helper, /\bcsrfFetch\(/, "post must use the client helper");
  assert.equal(/\bfetch\(/.test(helper), false, "post must not build a bare fetch");
});

