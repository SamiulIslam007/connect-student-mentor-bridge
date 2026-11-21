import { mkdirSync } from "node:fs";
import path from "node:path";

import { expect, test } from "@playwright/test";

/**
 * The measured half of the visual contract (D-243): a page must not scroll
 * sideways at 360 CSS px, every control must be at least 44 px tall, and focus
 * must be visible. Screenshots are written to `docs/audit/` for the handoff.
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
const SHOTS = path.join(__dirname, "..", "docs", "audit");
const PREFIX = process.env.E2E_SHOT_PREFIX ?? "2026-11-21-visual";

test.use({ viewport: { width: 360, height: 800 } });

test("every core surface fits 360 px without sideways scrolling", async ({ page }) => {
  mkdirSync(SHOTS, { recursive: true });
  for (const surface of SURFACES) {
    await page.goto(surface, { waitUntil: "domcontentloaded" });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow, `${surface} overflows at 360 px by ${overflow} px`).toBeLessThanOrEqual(1);
    const name = surface === "/" ? "home" : surface.replace(/\//g, "-").replace(/^-/, "");
    await page.screenshot({ path: path.join(SHOTS, `${PREFIX}-${name}.png`), fullPage: true });
  }
});

test("every interactive control is at least 44 px tall", async ({ page }) => {
  const small: string[] = [];
  for (const surface of SURFACES) {
    await page.goto(surface, { waitUntil: "domcontentloaded" });
    const offenders = await page.evaluate(() => {
      const found: string[] = [];
      const controls = document.querySelectorAll("button, a, input, select, textarea");
      for (const control of controls) {
        const box = control.getBoundingClientRect();
        if (box.width === 0 && box.height === 0) {
          continue;
        }
        // An inline link inside a sentence is exempt (WCAG 2.5.5 exempts links in
        // a block of text); every control that stands alone must meet the target.
        if (control instanceof HTMLAnchorElement && getComputedStyle(control).display === "inline") {
          continue;
        }
        // A checkbox is reached through its label, which carries the target.
        if (control instanceof HTMLInputElement && control.type === "checkbox") {
          continue;
        }
        if (box.height < 44) {
          found.push(`${control.tagName.toLowerCase()} ${control.textContent?.trim().slice(0, 30)}`);
        }
      }
      return found;
    });
    small.push(...offenders.map((entry) => `${surface}: ${entry}`));
  }
  expect(small).toEqual([]);
});

test("the focus ring is visible on the first control of each surface", async ({ page }) => {
  for (const surface of SURFACES) {
    await page.goto(surface, { waitUntil: "domcontentloaded" });
    await page.keyboard.press("Tab");
    const ring = await page.evaluate(() => {
      const active = document.activeElement;
      if (!active) {
        return { outlineWidth: "0px", outlineStyle: "none" };
      }
      const style = getComputedStyle(active);
      return { outlineWidth: style.outlineWidth, outlineStyle: style.outlineStyle };
    });
    expect(ring.outlineStyle, `${surface} shows no focus ring`).not.toBe("none");
    expect(ring.outlineWidth, `${surface} focus ring is thinner than 2 px`).toBe("2px");
  }
});

test("desktop keeps the header at the top and one primary action in view", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/sign-up", { waitUntil: "domcontentloaded" });
  const header = await page.locator("header").first().boundingBox();
  expect(header?.y, "the header must stay at the top of the page").toBe(0);
  const submit = await page.getByRole("button", { name: "Create account" }).boundingBox();
  expect(submit?.y ?? 9999, "the primary action must be within the first viewport").toBeLessThan(900);
  await page.screenshot({
    path: path.join(SHOTS, `${PREFIX}-sign-up-desktop.png`),
    fullPage: false,
  });
});

test("the tokens reach the browser as computed values", async ({ page }) => {
  // Desktop width: the narrow-viewport block scales the display size on purpose.
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/sign-up", { waitUntil: "domcontentloaded" });
  const values = await page.evaluate(() => {
    const body = getComputedStyle(document.body);
    const heading = getComputedStyle(document.querySelector("h1")!);
    const button = getComputedStyle(document.querySelector("button:not([disabled])")!);
    const input = getComputedStyle(document.querySelector("input[type=email]")!);
    return {
      bodyBackground: body.backgroundColor,
      bodyColor: body.color,
      bodyFont: body.fontFamily,
      headingSize: heading.fontSize,
      headingWeight: heading.fontWeight,
      buttonBackground: button.backgroundColor,
      buttonColor: button.color,
      buttonHeight: Math.round(button.minHeight ? parseFloat(button.height) : 0),
      inputBorder: input.borderTopColor,
      inputWidth: input.width,
    };
  });
  expect(values.bodyBackground).toBe("rgb(255, 255, 255)");
  expect(values.bodyColor).toBe("rgb(22, 22, 22)");
  expect(values.bodyFont).toContain("system-ui");
  expect(values.headingSize).toBe("32px");
  expect(values.headingWeight).toBe("600");
  expect(values.buttonBackground).toBe("rgb(15, 98, 254)");
  expect(values.buttonColor).toBe("rgb(255, 255, 255)");
  expect(values.inputBorder).toBe("rgb(141, 141, 141)");
  expect(values.inputWidth).not.toBe("0px");
  await page.screenshot({ path: path.join(SHOTS, `${PREFIX}-computed-sign-up.png`) });
});
