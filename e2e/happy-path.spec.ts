import { execFileSync } from "node:child_process";
import path from "node:path";

import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";

import { mentor, newStudent } from "./support/actors";
import { labels, SIGNUP_INTENT_COOKIE, SIGNUP_MIN_SUBMIT_SECONDS } from "./support/labels";
import { latestLinkFor } from "./support/mailpit";
import { totp } from "./support/totp";
import { WEB_ORIGIN } from "./support/env";

const repoRoot = path.join(__dirname, "..");
const student = newStudent();

test.describe.configure({ mode: "serial" });

/**
 * The marker is minted by the page and re-minted by React's development double
 * mount, so the age is read from the live cookie each time until it clears the
 * product's own floor.
 */
async function waitOutTheIntentFloor(context: BrowserContext, page: Page): Promise<void> {
  const floorMs = SIGNUP_MIN_SUBMIT_SECONDS * 1_000;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const marker = (await context.cookies(WEB_ORIGIN)).find(
      (cookie) => cookie.name === SIGNUP_INTENT_COOKIE,
    );
    // Next may percent-encode the ISO instant, and Playwright returns it as stored.
    const issuedAt = marker
      ? Date.parse(decodeURIComponent(marker.value).replace(/"/g, ""))
      : Number.NaN;
    const ageMs = Number.isNaN(issuedAt) ? -1 : Date.now() - issuedAt;
    if (ageMs >= floorMs) {
      return;
    }
    await page.waitForTimeout(200);
  }
  throw new Error(`the sign-up intent marker never aged past ${floorMs} ms`);
}

async function fillSignUp(page: Page, email: string, password: string): Promise<void> {
  await page.getByLabel(labels.signUp.displayName).fill("E2E Student");
  await page.getByLabel(labels.signUp.email).fill(email);
  await page.getByLabel(labels.signUp.password).fill(password);
  await page.getByLabel(labels.signUp.dateOfBirth).fill("2000-01-01");
  await page.getByRole("checkbox").check();
}

async function signIn(page: Page, email: string, password: string): Promise<void> {
  await page.goto("/sign-in");
  await page.getByLabel(labels.signIn.email).fill(email);
  await page.getByLabel(labels.signIn.password).fill(password);
  await page.getByRole("button", { name: labels.signIn.submit, exact: true }).click();
}

async function signInMentor(browser: Browser): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await signIn(page, mentor.email, mentor.password);
  console.log("step 5a: password submitted");
  await page.waitForURL("**/sign-in/mfa");
  console.log("step 5b: mfa page");
  await page.getByLabel(labels.mfa.code).fill(totp(mentor.totpSecret));
  await page.getByRole("button", { name: labels.mfa.submit }).click();
  await page.waitForURL("**/account");
  console.log("step 5c: signed in");
  return { context, page };
}

test("the happy path: sign-up, verify, profile, request, accept, message, outcome, confirm, count", async ({
  browser,
}) => {
  const studentContext = await browser.newContext();
  const studentPage = await studentContext.newPage();

  console.log("step 1: bot floor");
  await studentPage.goto("/sign-up");
  await expect(studentPage.getByRole("heading", { name: labels.signUp.title })).toBeVisible();
  await fillSignUp(studentPage, `too-fast-${student.email}`, student.password);
  await studentPage.getByRole("button", { name: labels.signUp.submit }).click();
  await expect(studentPage.getByText(labels.signUp.refused)).toBeVisible();

  console.log("step 2: sign-up and verify");
  await studentPage.reload();
  await waitOutTheIntentFloor(studentContext, studentPage);
  await fillSignUp(studentPage, student.email, student.password);
  await studentPage.getByRole("button", { name: labels.signUp.submit }).click();
  await expect(studentPage.getByRole("status")).toHaveText(labels.signUp.success);

  const verificationLink = await latestLinkFor(
    student.email,
    /https?:\/\/\S*\/api\/auth\/verify\?token=[^\s"<]+/,
  );
  await studentPage.goto(verificationLink);
  await expect(studentPage.getByRole("status")).toHaveText(labels.verify.verified);

  console.log("step 3: sign in and profile");
  await signIn(studentPage, student.email, student.password);
  await studentPage.waitForURL("**/account");
  await studentPage.goto("/profile");
  // The mentor section carries the same labels, so everything is scoped to the
  // form that owns the student goals field.
  const studentForm = studentPage
    .locator("form")
    .filter({ has: studentPage.getByLabel(labels.profile.goals) });
  await studentForm.getByLabel(labels.profile.goals).fill("Land a backend internship.");
  await studentForm.getByLabel(labels.profile.primaryField).fill("Software engineering");
  await studentForm.getByRole("button", { name: labels.profile.saveStudent }).click();
  await expect(studentPage.getByText(labels.profile.studentSaved)).toBeVisible();

  console.log("step 4: request");
  await studentPage.goto("/mentors");
  // The card for the seeded mentor, not whichever card happens to be first.
  const mentorCard = studentPage.locator("li").filter({ hasText: mentor.displayName }).first();
  await mentorCard.locator('a[href^="/request/new"]').click();
  await studentPage.getByLabel(labels.requestNew.question).fill("How do I prepare for a backend interview?");
  await studentPage.getByLabel(labels.requestNew.contextSummary).fill("Final-year student, one internship.");
  await studentPage.getByLabel(labels.requestNew.targetOutcome).fill("Pass a technical interview.");
  await studentPage.getByRole("button", { name: labels.requestNew.submit }).click();
  await studentPage.waitForURL("**/requests");
  const sentTab = studentPage.getByRole("button", { name: labels.requests.sent, exact: true });
  if (await sentTab.isEnabled()) {
    await sentTab.click();
  }
  await expect(studentPage.getByText("How do I prepare for a backend interview?")).toBeVisible();

  console.log("step 5: mentor sign-in and accept");
  const { context: mentorContext, page: mentorPage } = await signInMentor(browser);
  console.log("step 5d-1: goto requests");
  await mentorPage.goto("/requests", { waitUntil: "domcontentloaded" });
  console.log(`step 5d-2: on ${mentorPage.url()}`);
  // The default tab depends on the viewer's roles, and a disabled button never
  // becomes actionable, so the tab is only switched when it is not already active.
  const receivedTab = mentorPage.getByRole("button", {
    name: labels.requests.received,
    exact: true,
  });
  if (await receivedTab.isEnabled()) {
    await receivedTab.click();
  }
  console.log("step 5d: received tab");
  // The row for this run's question, not any other pending request.
  const receivedRow = mentorPage
    .locator("li")
    .filter({ hasText: "How do I prepare for a backend interview?" })
    .first();
  await receivedRow.getByRole("button", { name: labels.requests.accept }).click();
  await expect(mentorPage.getByText(labels.requests.accepted)).toBeVisible();
  console.log("step 5e: accepted");
  // The list renders the decision from the row it already holds, so the new
  // mentorship link appears on the next read.
  await mentorPage.reload({ waitUntil: "domcontentloaded" });
  const openLink = mentorPage
    .locator("li")
    .filter({ hasText: "How do I prepare for a backend interview?" })
    .first()
    .getByRole("link", { name: labels.requests.openMentorship });
  await expect(openLink).toBeVisible();
  await openLink.click();
  await mentorPage.waitForURL("**/mentorship/**");
  const mentorshipId = new URL(mentorPage.url()).pathname.split("/").pop()!;

  console.log("step 6: thread");
  const message = `Hello from the e2e run ${Date.now()}`;
  await mentorPage.getByLabel(labels.mentorship.messageLabel).fill(message);
  await mentorPage.getByRole("button", { name: labels.mentorship.send }).click();
  await expect(mentorPage.getByText(labels.mentorship.sent)).toBeVisible();

  // The student's list shows the count until the thread is actually opened; the
  // page then writes the marker, which is the only thing that clears it (D-246).
  await studentPage.goto("/requests");
  const sentTabNow = studentPage.getByRole("button", { name: labels.requests.sent, exact: true });
  if (await sentTabNow.isEnabled()) {
    await sentTabNow.click();
  }
  await expect(studentPage.getByText(labels.requests.unreadOne)).toBeVisible();

  await studentPage.goto(`/mentorship/${mentorshipId}`);
  await expect(studentPage.getByText(message)).toBeVisible();
  await expect(studentPage.getByText(labels.mentorship.newMessages)).toBeVisible();

  await studentPage.goto("/requests");
  const sentTabAfter = studentPage.getByRole("button", { name: labels.requests.sent, exact: true });
  if (await sentTabAfter.isEnabled()) {
    await sentTabAfter.click();
  }
  await expect(studentPage.getByText(labels.requests.unreadOne)).toHaveCount(0);

  console.log("step 7: outcome and confirm");
  // Back on the thread: the outcome form lives there, not on the list.
  await studentPage.goto(`/mentorship/${mentorshipId}`);
  await studentPage.getByLabel(labels.outcome.type).selectOption("INTERNSHIP");
  await studentPage.getByLabel(labels.outcome.contribution).selectOption("DIRECTLY_ENABLED");
  await studentPage
    .getByLabel(labels.outcome.description)
    .fill("The interview preparation worked: I was offered the internship.");
  await studentPage.getByRole("button", { name: labels.outcome.report }).click();
  await expect(studentPage.getByText(labels.outcome.reported)).toBeVisible();

  await mentorPage.goto(`/mentorship/${mentorshipId}`);
  await mentorPage.getByRole("button", { name: labels.outcome.confirm }).click();
  await expect(mentorPage.getByText(labels.outcome.statusConfirmed).first()).toBeVisible();

  console.log("step 8: count");
  const counted = execFileSync(
    "node",
    ["--import", "tsx", path.join(__dirname, "support/count-now.ts")],
    {
      cwd: repoRoot,
      encoding: "utf8",
      // The counting job is decorated; tsx needs the API's compiler options.
      env: { ...process.env, TSX_TSCONFIG_PATH: "services/api/tsconfig.json" },
    },
  );
  expect(counted).toContain('"event":"e2e.count_due_outcomes"');
  expect(counted).not.toContain('"counted":0');

  await mentorPage.goto("/profile");
  await expect(mentorPage.getByRole("heading", { name: labels.impact.title })).toBeVisible();
  await expect(mentorPage.getByText(labels.impact.countedOutcomes).first()).toBeVisible();
  await expect(mentorPage.getByText(labels.impact.empty)).toHaveCount(0);

  await studentContext.close();
  await mentorContext.close();
});
