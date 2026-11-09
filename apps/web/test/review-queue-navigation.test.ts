import assert from "node:assert/strict";
import { test } from "node:test";

import { navLinks } from "../lib/navigation.js";
import { strings } from "../lib/strings.js";

test("the Admin link appears only for a platform admin", () => {
  const plain = navLinks(true, ["STUDENT"]);
  assert.ok(!plain.items.some((item) => item.kind === "link" && item.href === "/admin/reviews"));

  const admin = navLinks(true, ["STUDENT", "PLATFORM_ADMIN"]);
  const link = admin.items.find((item) => item.kind === "link" && item.href === "/admin/reviews");
  assert.ok(link, "a platform admin sees the queue");
  assert.equal(link.kind === "link" ? link.label : "", strings.nav.admin);
  assert.deepEqual(admin.items.at(-1), { kind: "sign-out", label: "Sign out" });

  assert.equal(navLinks(false, ["PLATFORM_ADMIN"]).items.length, 2, "signed out never sees Admin");
});
