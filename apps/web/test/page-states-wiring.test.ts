import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

/**
 * One table for every page this sweep touches: the file, the state lines it must
 * render, and the controls it must disable. The repo has no renderer, so the page
 * source is the subject, exactly as the other page tests do it.
 */
interface PageCase {
  file: string;
  /** Substrings the page source must contain. */
  requires: string[];
}

const PAGES: PageCase[] = [
  {
    file: "../app/account/sessions/page.tsx",
    requires: [
      'from "../../../lib/page-state"',
      'stateKey("loading", "sessions")',
      'stateKey("empty", "sessions")',
      'role="alert"',
      '{strings.sessions.retry}',
      "disabled={busy}",
      "settleSuccess(body.data.length === 0)",
    ],
  },
  {
    file: "../app/account/security/page.tsx",
    requires: [
      'from "../../../lib/page-state"',
      'stateKey("loading", "security")',
      'role="alert"',
      "{strings.security.retry}",
      '{strings.security.working}',
    ],
  },
  {
    file: "../app/profile/page.tsx",
    requires: [
      'from "../../lib/page-state"',
      'stateKey("loading", "profile")',
      'role="alert"',
      "{strings.profile.retry}",
      '{strings.profile.saving}',
      "disabled={saving !== null}",
      "setSaving(`availability:${kind}`)",
    ],
  },
  {
    file: "../app/request/new/page.tsx",
    requires: [
      'from "../../../lib/page-state"',
      'stateKey("loading", "requestNew")',
      'role="alert"',
      "disabled={sending}",
    ],
  },
  {
    file: "../app/sign-in/page.tsx",
    requires: [
      'from "../../lib/page-state"',
      'stateKey("loading", "signIn")',
      'role="alert"',
      "disabled={pending}",
    ],
  },
  {
    file: "../app/sign-up/page.tsx",
    requires: [
      'from "../../lib/page-state"',
      'stateKey("loading", "signUp")',
      'role={success ? "status" : "alert"}',
      "disabled={pending ||",
    ],
  },
  {
    file: "../app/sign-in/mfa/page.tsx",
    requires: [
      'from "../../../lib/page-state"',
      'stateKey("loading", "mfa")',
      'role="alert"',
      "disabled={submitting}",
    ],
  },
  {
    file: "../app/forgot-password/page.tsx",
    requires: [
      'from "../../lib/page-state"',
      'stateKey("loading", "forgotPassword")',
      'role={sent ? "status" : "alert"}',
      "disabled={pending}",
    ],
  },
  {
    file: "../app/reset/reset-form.tsx",
    requires: [
      'from "../../lib/page-state"',
      'stateKey("loading", "reset")',
      'role={success ? "status" : "alert"}',
      "disabled={pending}",
    ],
  },
  {
    file: "../app/verify/page.tsx",
    requires: [
      'from "../../lib/page-state"',
      'stateKey("error", "verify")',
      'role={status === "verified" ? "status" : "alert"}',
    ],
  },
];

function source(file: string): string {
  return readFileSync(fileURLToPath(new URL(file, import.meta.url)), "utf8");
}

test("every touched page renders its state lines and disables its control in flight", () => {
  for (const page of PAGES) {
    const text = source(page.file);
    for (const token of page.requires) {
      assert.ok(text.includes(token), `${page.file} must contain ${token}`);
    }
  }
});

test("every touched page carries the alert role on its failure line", () => {
  let alerts = 0;
  for (const page of PAGES) {
    const text = source(page.file);
    assert.ok(text.includes("alert"), `${page.file} has no alert role`);
    alerts += text.split('"alert"').length - 1;
  }
  assert.ok(alerts >= PAGES.length, `${alerts} alert roles for ${PAGES.length} pages`);
});

test("no touched page keeps a bare container instead of a state line", () => {
  for (const page of PAGES) {
    const text = source(page.file);
    assert.ok(!text.includes("state === \"loading\" ? null"), `${page.file} hides the loading line`);
  }
});
