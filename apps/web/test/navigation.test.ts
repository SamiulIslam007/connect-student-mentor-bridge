import assert from "node:assert/strict";
import { test } from "node:test";

import { isSignedIn, navLinks } from "../lib/navigation.js";

test("a signed-out visitor is offered sign-in and sign-up only", () => {
  const nav = navLinks(false);

  assert.equal(nav.appName, "connect");
  assert.deepEqual(nav.items, [
    { kind: "link", href: "/sign-in", label: "Sign in" },
    { kind: "link", href: "/sign-up", label: "Create account" },
  ]);
});

test("a signed-in account is offered the app destinations and sign out", () => {
  const nav = navLinks(true);

  assert.deepEqual(nav.items, [
    { kind: "link", href: "/account", label: "Account" },
    { kind: "link", href: "/profile", label: "Profile" },
    { kind: "link", href: "/account/sessions", label: "Sessions" },
    { kind: "sign-out", label: "Sign out" },
  ]);
});

test("the signed-out set contains no signed-in destination", () => {
  const signedOut = navLinks(false);
  const hrefs = signedOut.items.flatMap((item) => (item.kind === "link" ? [item.href] : []));

  for (const signedInOnly of ["/account", "/profile", "/account/sessions"]) {
    assert.ok(!hrefs.includes(signedInOnly), `${signedInOnly} must not be offered signed out`);
  }
  assert.ok(!signedOut.items.some((item) => item.kind === "sign-out"));
});

test("a failed or slow probe yields the signed-out set", () => {
  for (const status of [0, 401, 403, 500, 502]) {
    assert.equal(isSignedIn(status), false);
    assert.deepEqual(navLinks(isSignedIn(status)), navLinks(false));
  }
  assert.equal(isSignedIn(200), true);
});
