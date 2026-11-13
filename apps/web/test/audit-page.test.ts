import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  AUDIT_FILTER_KEYS,
  breakGlassMarker,
  buildAuditQuery,
  emptyFilters,
  filtersFromQuery,
  occurredAtText,
  reasonText,
  type AuditRow,
} from "../lib/audit.js";
import { navLinks } from "../lib/navigation.js";
import { strings } from "../lib/strings.js";

function pageSource(): string {
  return readFileSync(
    fileURLToPath(new URL("../app/admin/audit/page.tsx", import.meta.url)),
    "utf8",
  );
}

function row(overrides: Partial<AuditRow> = {}): AuditRow {
  return {
    id: "3f0a6a4e-0000-4000-8000-000000000000",
    occurred_at: "2026-11-13T10:00:00.000Z",
    actor_user_id: "acc_1",
    actor_role: "PLATFORM_ADMIN",
    action: "ACCOUNT_SUSPENDED",
    object_type: "users",
    object_id: "acc_2",
    request_id: "req-1",
    break_glass: false,
    reason: "harassment in the thread",
    ...overrides,
  };
}

test("no filter produces a bare path, and a set filter is URL-encoded", () => {
  assert.equal(buildAuditQuery(emptyFilters()), "");
  assert.equal(
    buildAuditQuery({ action: "SIGN_IN_FAILED", from: "2026-11-01" }),
    "?action=SIGN_IN_FAILED&from=2026-11-01",
  );
  assert.equal(
    buildAuditQuery({ object_id: "a b&c" }),
    "?object_id=a+b%26c",
    "an id with a delimiter stays one value",
  );
  assert.equal(buildAuditQuery(emptyFilters(), "2026-11-13T10:00:00.000Z|abc"), "?cursor=2026-11-13T10%3A00%3A00.000Z%7Cabc");
});

test("the filter state round-trips through the query string", () => {
  const original = { ...emptyFilters(), actor: "acc_1", object_type: "users" };
  assert.deepEqual(filtersFromQuery(buildAuditQuery(original)), original);
  assert.deepEqual(filtersFromQuery(""), emptyFilters());
});

test("only the six documented filters travel in the URL", () => {
  assert.deepEqual([...AUDIT_FILTER_KEYS], ["actor", "action", "object_type", "object_id", "from", "to"]);
  const query = buildAuditQuery({ ...emptyFilters(), actor: "acc_1" });
  assert.ok(!query.includes("metadata") && !query.includes("hash"));
});

test("a reason renders, an absent one says so, and break-glass is marked", () => {
  assert.equal(reasonText(row()), "harassment in the thread");
  assert.equal(reasonText(row({ reason: null })), strings.audit.noReason);
  assert.equal(reasonText(row({ reason: "   " })), strings.audit.noReason);
  assert.equal(breakGlassMarker(row({ break_glass: true })), strings.audit.breakGlass);
  assert.equal(breakGlassMarker(row()), null);
});

test("the instant is rendered in UTC and an unparseable one is passed through", () => {
  assert.equal(occurredAtText(row()), "2026-11-13T10:00:00.000Z");
  assert.equal(occurredAtText(row({ occurred_at: "not a date" })), "not a date");
});

test("the shared admin navigation offers the audit log only to a platform admin", () => {
  const admin = navLinks(true, ["PLATFORM_ADMIN"]);
  assert.ok(
    admin.items.some((item) => item.kind === "link" && item.href === "/admin/audit"),
    "a platform admin sees the link",
  );
  const mentor = navLinks(true, ["MENTOR"]);
  assert.ok(
    !mentor.items.some((item) => item.kind === "link" && item.href === "/admin/audit"),
    "a mentor does not",
  );
});

test("the page renders the filters, the three states and the keyset control", () => {
  const source = pageSource();
  for (const token of [
    "from \"../../../lib/audit\"",
    'strings.audit.actorLabel',
    'strings.audit.actionLabel',
    'strings.audit.objectTypeLabel',
    'strings.audit.objectIdLabel',
    'strings.audit.fromLabel',
    'strings.audit.toLabel',
    'role="status"',
    'role="alert"',
    'strings.audit.empty',
    'loadMore',
    "reasonText(row)",
    "breakGlassMarker(row)",
  ]) {
    assert.ok(source.includes(token), `the page must contain ${token}`);
  }
  assert.ok(!source.includes("metadata"), "the page never names metadata");
});
