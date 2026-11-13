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
    { kind: "link", href: "/mentors", label: "Mentors" },
    { kind: "link", href: "/requests", label: "Requests" },
    { kind: "link", href: "/account/sessions", label: "Sessions" },
    { kind: "link", href: "/consent", label: "Consents" },
    { kind: "sign-out", label: "Sign out" },
  ]);
});

test("the signed-out set contains no signed-in destination", () => {
  const signedOut = navLinks(false);
  const hrefs = signedOut.items.flatMap((item) => (item.kind === "link" ? [item.href] : []));

  for (const signedInOnly of ["/account", "/profile", "/mentors", "/requests", "/account/sessions", "/consent"]) {
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

test("the institutions entry appears for a platform admin only", () => {
  const admin = navLinks(true, ["STUDENT", "PLATFORM_ADMIN"]);
  const hrefs = admin.items.flatMap((item) => (item.kind === "link" ? [item.href] : []));
  assert.ok(hrefs.includes("/admin/institutions"), "the platform admin gets the page");

  for (const roles of [["STUDENT", "MENTOR"], ["STUDENT", "INSTITUTION_ADMIN"], ["STUDENT"]]) {
    const other = navLinks(true, roles);
    const otherHrefs = other.items.flatMap((item) => (item.kind === "link" ? [item.href] : []));
    assert.ok(!otherHrefs.includes("/admin/institutions"), `${roles.join(", ")} does not`);
  }

  assert.deepEqual(navLinks(false, ["PLATFORM_ADMIN"]), navLinks(false), "signed out is unchanged");
});

test("the claims entry appears for an institution admin only", () => {
  const admin = navLinks(true, ["STUDENT", "INSTITUTION_ADMIN"]);
  const hrefs = admin.items.flatMap((item) => (item.kind === "link" ? [item.href] : []));
  assert.ok(hrefs.includes("/institution/attestations"), "the role gets the queue");

  const mentor = navLinks(true, ["STUDENT", "MENTOR"]);
  const mentorHrefs = mentor.items.flatMap((item) => (item.kind === "link" ? [item.href] : []));
  assert.ok(!mentorHrefs.includes("/institution/attestations"), "a mentor does not");

  assert.deepEqual(navLinks(false, ["INSTITUTION_ADMIN"]), navLinks(false), "signed out is unchanged");
});
