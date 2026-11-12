import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { navLinks } from "../lib/navigation.js";
import {
  REPORT_REASON_OPTIONS,
  canReadThread,
  showReportControl,
  targetKindLabel,
  threadSummary,
  threadView,
} from "../lib/reports.js";
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

test("the break-glass action is offered only for a message with a mentorship", () => {
  assert.equal(canReadThread("message", "m-1"), true);
  assert.equal(canReadThread("message", null), false);
  assert.equal(canReadThread("message", ""), false);
  for (const kind of ["user", "profile", "outcome"]) {
    assert.equal(canReadThread(kind, "m-1"), false, kind);
  }
});

const threadViewValue = {
  mentorship_id: "m-1",
  status: "active",
  agreement: {
    cadence: "weekly",
    planned_weeks: 4,
    goal: "Get an internship",
    agreement_acknowledged: true,
  },
  messages: [
    { id: "a", sender_name: "Rahim", body: "One", created_at: "2026-11-01T10:00:00.000Z" },
    { id: "b", sender_name: "Ayesha", body: "Two", created_at: "2026-11-01T11:00:00.000Z" },
  ],
  sessions: [
    { id: "s-1", scheduled_start: "2026-11-02T09:00:00.000Z", duration_minutes: 45, status: "scheduled" },
    { id: "s-2", scheduled_start: "2026-11-09T09:00:00.000Z", duration_minutes: 30, status: "scheduled" },
  ],
};

test("the thread summary counts messages and sessions and names the range", () => {
  assert.deepEqual(threadSummary(threadViewValue), {
    messageCount: 2,
    firstAt: "2026-11-01T10:00:00.000Z",
    lastAt: "2026-11-01T11:00:00.000Z",
    agreementPresent: true,
    sessionCount: 2,
  });
  assert.deepEqual(
    threadSummary({
      ...threadViewValue,
      agreement: { cadence: null, planned_weeks: null, goal: null, agreement_acknowledged: false },
      messages: [],
      sessions: [],
    }),
    { messageCount: 0, firstAt: null, lastAt: null, agreementPresent: false, sessionCount: 0 },
  );
});

test("a malformed thread payload reads as null", () => {
  assert.equal(threadView(null), null);
  assert.equal(threadView({}), null);
  assert.equal(threadView({ mentorship_id: 42 }), null);
  assert.equal(threadView(threadViewValue)?.messages.length, 2);
});

test("the page offers the read only for a message target and requires a reason", () => {
  const page = readFileSync(
    fileURLToPath(new URL("../app/admin/reports/page.tsx", import.meta.url)),
    "utf8",
  );
  assert.match(page, /canReadThread\(report\.target_kind, report\.mentorship_id\)/);
  assert.match(page, /fetch\("\/api\/admin\/mentorships\/break-glass"/);
  assert.match(page, /maxLength=\{1000\}/);
  assert.match(page, /strings\.adminReports\.readThreadReasonRequired/);
  assert.match(page, /strings\.adminReports\.readThreadError/);
  assert.match(page, /strings\.adminReports\.readThread/);
});
