import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

/**
 * The wiring of the sign-up checks (SEC-ABUSE-1). Source-level on purpose: the
 * page and the route are React and Next entry points, and the property under
 * test is that they call the one pure helper rather than re-implementing it.
 */
const here = import.meta.dirname;
const read = (...segments: string[]): string =>
  readFileSync(path.join(here, "..", ...segments), "utf8");

test("the sign-up page mints the marker once on mount and posts the honeypot", () => {
  const page = read("app", "sign-up", "page.tsx");
  assert.match(page, /fetch\("\/api\/auth\/register-intent"\)/);
  assert.match(page, /useEffect\(/);
  assert.match(page, /contact_website: form\.get\("contact_website"\)/);
});

test("the honeypot input carries the four attributes that keep people out of it", () => {
  const page = read("app", "sign-up", "page.tsx");
  assert.match(page, /name="contact_website"/);
  assert.match(page, /tabIndex=\{-1\}/);
  assert.match(page, /aria-hidden="true"/);
  assert.match(page, /autoComplete="off"/);
  // The label is the empty catalog string, not a hard-coded word.
  assert.match(page, /strings\.signUp\.honeypotLabel/);
});

test("the register route applies both checks through the pure helper", () => {
  const route = read("app", "api", "auth", "register", "route.ts");
  assert.match(route, /honeypotFilled\(parsed\.value\)/);
  assert.match(route, /intentRefusal\(/);
  assert.match(route, /intentCookieFrom\(request\.headers\.get\("cookie"\)\)/);
  assert.match(route, /REGISTRATION_REFUSED/);
  // The refusal message is the catalog string, never a literal in the route.
  assert.match(route, /strings\.signUp\.refused/);
});

test("the intent route sets an httpOnly marker from the options helper", () => {
  const route = read("app", "api", "auth", "register-intent", "route.ts");
  assert.match(route, /signupIntentCookieOptions\(/);
  assert.match(route, /cookies\.set\(/);
  assert.match(route, /status: 204/);
});
