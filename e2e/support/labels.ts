/**
 * The visible text this path drives. Playwright's loader only transforms files
 * under the test directory, so these are copied rather than imported from
 * `apps/web/lib/strings.ts`; `support/prepare.ts` fails the run if any of them has
 * drifted from the catalog.
 */
export const labels = {
  signUp: {
    title: "Create your account",
    displayName: "Display name",
    email: "Email address",
    password: "Password (at least 12 characters)",
    dateOfBirth: "Date of birth",
    submit: "Create account",
    success: "Check your email for the verification link.",
    refused: "This submission could not be processed. Reload the page and try again.",
  },
  verify: { verified: "Your email address is verified. You can sign in now." },
  signIn: { email: "Email address", password: "Password", submit: "Sign in" },
  mfa: { code: "Six-digit code", submit: "Verify" },
  profile: {
    goals: "What do you want to achieve?",
    primaryField: "Primary field",
    saveStudent: "Save student profile",
    studentSaved: "Your student profile was saved.",
  },
  requestNew: {
    question: "Your question (up to 300 characters)",
    contextSummary: "Context (up to 2000 characters)",
    targetOutcome: "What outcome do you want? (up to 300 characters)",
    submit: "Send request",
  },
  requests: {
    sent: "Sent",
    received: "Received",
    accept: "Accept",
    accepted: "The request was accepted.",
    openMentorship: "Open the mentorship",
  },
  mentorship: { messageLabel: "Message", send: "Send message", sent: "The message was sent." },
  outcome: {
    type: "Outcome type",
    contribution: "How much did your mentor contribute?",
    description: "What happened (up to 2000 characters)",
    report: "Report outcome",
    reported: "The outcome was reported and is waiting for your mentor.",
    confirm: "Confirm this happened",
    statusConfirmed: "Confirmed",
  },
  impact: {
    title: "Verified impact",
    countedOutcomes: "Counted outcomes",
    empty: "No counted outcomes yet. A confirmed outcome counts after its cooling period.",
  },
} as const;

/** `packages/config/src/index.ts`: the sign-up intent floor, in seconds. */
export const SIGNUP_MIN_SUBMIT_SECONDS = 2;

/** `apps/web/lib/sign-up-intent.ts`: the httpOnly marker cookie's name. */
export const SIGNUP_INTENT_COOKIE = "connect_signup_intent";
