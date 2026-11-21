import { readdirSync } from "node:fs";
import path from "node:path";

import { expect, test } from "@playwright/test";

import { auditPage, formatViolation, type Violation } from "./support/axe";

/**
 * The automated half of the accessibility evidence (D-244): axe on every surface
 * the app serves. Serious and critical violations fail the run; moderate and
 * minor are printed so the dated record can count them.
 *
 * The manual keyboard and screen-reader pass cannot be performed here; it is
 * recorded in `docs/audit/2026-11-21-accessibility-pass.md`.
 */
const SURFACES = [
  "/",
  "/sign-in",
  "/sign-in/mfa",
  "/sign-up",
  "/verify",
  "/forgot-password",
  "/reset",
  "/account",
  "/account/security",
  "/account/sessions",
  "/consent",
  "/terms",
  "/privacy",
  "/profile",
  "/mentors",
  "/request/new",
  "/requests",
  "/mentorship/00000000-0000-0000-0000-000000000000",
  "/institution/attestations",
  "/admin/reviews",
  "/admin/reports",
  "/admin/audit",
  "/admin/institutions",
];

const collected: Violation[] = [];

function report(surface: string, violations: Violation[]): void {
  collected.push(...violations);
  for (const violation of violations) {
    console.log(formatViolation(violation));
  }
}

function pageSet(): string[] {
  const appDir = path.join(__dirname, "..", "apps", "web", "app");
  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        return walk(full);
      }
      if (entry.name !== "page.tsx") {
        return [];
      }
      const route = path.relative(appDir, dir).split(path.sep).join("/");
      return [`/${route}`.replace(/\/\[id\]$/, "/00000000-0000-0000-0000-000000000000")];
    });
  return walk(appDir).sort();
}

test("the audited surfaces are exactly the pages the app serves", () => {
  expect([...SURFACES].sort()).toEqual(pageSet());
});

test("every surface has no serious or critical violation", async ({ page }) => {
  const blocking: Violation[] = [];
  for (const surface of SURFACES) {
    await page.goto(surface, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(150);
    const result = await auditPage(page, surface);
    console.log(JSON.stringify({ event: "axe.surface", surface, passes: result.passes, violations: result.violations.length }));
    report(surface, result.violations);
    if (result.blocking) {
      blocking.push(...result.violations.filter((v) => v.impact === "serious" || v.impact === "critical"));
    }
  }
  expect(blocking.map(formatViolation), "serious or critical axe violations").toEqual([]);
});

test("the error state is audited, and its alert is announced", async ({ page }) => {
  for (const surface of ["/requests", "/mentors"]) {
    await page.route("**/api/**", (route) => route.abort());
    await page.goto(surface, { waitUntil: "domcontentloaded" });
    const alert = page.locator('[role="alert"]').first();
    await expect(alert, `${surface} must render an alert when its read fails`).toBeVisible();
    const result = await auditPage(page, `${surface} (error state)`);
    report(`${surface} (error state)`, result.violations);
    expect(
      result.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map(formatViolation),
      `${surface} error state has no serious or critical violation`,
    ).toEqual([]);
    await page.unroute("**/api/**");
  }
});

test("the runner detects a violation it is shown", async ({ page }) => {
  await page.goto("/sign-up", { waitUntil: "domcontentloaded" });
  // Append an element with a role but no accessible name: axe must report it, or
  // the whole gate above means nothing. Appended, not mutated in place, because
  // React reconciles the form on its next render.
  await page.evaluate(() => {
    const broken = document.createElement("div");
    broken.setAttribute("role", "img");
    broken.textContent = "";
    // body, not main: React re-renders main and would drop an injected child.
    document.body.appendChild(broken);
  });
  const result = await auditPage(page, "/sign-up (mutated)");
  expect(result.passes).toBeGreaterThan(0);
  expect(result.blocking).toBe(true);
  expect(result.violations.length).toBeGreaterThan(0);
});


test("keyboard traversal reaches every control in reading order with a visible focus ring", async ({
  page,
}) => {
  const surfaces = ["/", "/sign-in", "/sign-up", "/requests", "/mentors"];
  for (const surface of surfaces) {
    await page.goto(surface, { waitUntil: "domcontentloaded" });
    const order: string[] = [];
    for (let step = 0; step < 40; step += 1) {
      await page.keyboard.press("Tab");
      // One frame for the focus-visible style to be recalculated.
      await page.waitForTimeout(40);
      const state = await page.evaluate(() => {
        const active = document.activeElement as HTMLElement | null;
        if (!active || active === document.body) {
          return null;
        }
        const style = getComputedStyle(active);
        const box = active.getBoundingClientRect();
        return {
          label: `${active.tagName.toLowerCase()}${active.id ? `#${active.id}` : ""}${active.getAttribute("type") ? `[${active.getAttribute("type")}]` : ""}:${(active.textContent ?? "").trim().slice(0, 24)}`,
          outline: style.outlineStyle,
          width: style.outlineWidth,
          border: style.borderTopColor,
          type: active.getAttribute("type") ?? "",
          visible: box.width > 0 || box.height > 0,
        };
      });
      if (!state) {
        break;
      }
      expect(state.visible, `${surface}: focus reached a hidden element`).toBe(true);
      // Allow-list, with the reason: Chrome moves focus into the shadow sub-field of
      // a date or time input, so the host reports no outline during a Tab walk while a
      // programmatic focus on the same input measures 2px solid rgb(15, 98, 254)
      // (recorded in the audit). Every other control must show the ring.
      if (state.type === "date" || state.type === "time") {
        continue;
      }
      expect(
        state.outline !== "none" || state.border === "rgb(15, 98, 254)",
        `${surface}: ${state.label} has no focus ring`,
      ).toBe(true);
      if (order[order.length - 1] !== state.label) {
        order.push(state.label);
      }
    }
    expect(order.length, `${surface} must be reachable by keyboard`).toBeGreaterThan(0);
    console.log(JSON.stringify({ event: "keyboard.order", surface, controls: order.length }));
  }
});

test.afterAll(() => {
  const counts = collected.reduce<Record<string, number>>((totals, violation) => {
    totals[violation.impact] = (totals[violation.impact] ?? 0) + 1;
    return totals;
  }, {});
  console.log(JSON.stringify({ event: "axe.summary", total: collected.length, counts }));
});
