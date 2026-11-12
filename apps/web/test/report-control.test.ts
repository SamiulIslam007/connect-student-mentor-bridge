import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { navLinks } from "../lib/navigation.js";
import { REPORT_REASON_OPTIONS, showReportControl, targetKindLabel } from "../lib/reports.js";
import { strings } from "../lib/strings.js";

const threadPage = readFileSync(
  fileURLToPath(new URL("../app/mentorship/[id]/page.tsx", import.meta.url)),
  "utf8",
);
const adminPage = readFileSync(
  fileURLToPath(new URL("../app/admin/reports/page.tsx", import.meta.url)),
  "utf8",
);

test("only a participant sees the report control", () => {
  assert.equal(showReportControl("student"), true);
  assert.equal(showReportControl("mentor"), true);
  assert.equal(showReportControl(undefined), false);
  assert.equal(showReportControl("admin"), false);
});

test("the thread page reports a message in its own thread", () => {
  assert.match(threadPage, /showReportControl\(mentorship\.viewer_role\)/);
  assert.match(threadPage, /target_kind: "message"/);
  assert.match(threadPage, /\/api\/reports/);
  assert.match(threadPage, /strings\.report\.sent/);
  assert.doesNotMatch(threadPage, /reporter_user_id/);
});

test("every reason the form offers is a documented value", () => {
  assert.deepEqual(
    REPORT_REASON_OPTIONS.map((option) => option.value),
    ["harassment", "spam", "impersonation", "misrepresentation", "other"],
  );
  for (const option of REPORT_REASON_OPTIONS) {
    assert.ok((Object.values(strings.report) as string[]).includes(option.label), option.value);
  }
});

test("the admin page resolves and suspends through the BFF", () => {
  assert.match(adminPage, /\/api\/admin\/reports\//);
  assert.match(adminPage, /\/api\/admin\/accounts\//);
  assert.match(adminPage, /end_date/);
  assert.equal(targetKindLabel("message"), strings.adminReports.targetMessage);
  assert.equal(targetKindLabel("planet"), "planet");
});

test("the header offers the report queue to a platform admin only", () => {
  const admin = navLinks(true, ["PLATFORM_ADMIN"]).items.filter(
    (item) => item.kind === "link" && item.href.startsWith("/admin"),
  );
  assert.deepEqual(
    admin.map((item) => (item.kind === "link" ? item.href : "")),
    ["/admin/reviews", "/admin/reports", "/admin/institutions"],
  );
  const student = navLinks(true, ["STUDENT"]).items.filter(
    (item) => item.kind === "link" && item.href.startsWith("/admin"),
  );
  assert.deepEqual(student, []);
});
