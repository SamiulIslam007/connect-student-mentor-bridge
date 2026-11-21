/**
 * The demo seed's fixed values, kept in a module with no imports so the
 * end-to-end suite can read them without loading the database layer (D-236).
 *
 * Both are obviously fake and only exist for `SEED_DEMO_MENTORS=1`, which the
 * seed refuses under `NODE_ENV=production` (AGENTS.md rule 12).
 */
export const DEMO_TOTP_SECRET = "DEMO-SEED-NOT-A-REAL-TOTP-SECRET";

/** Fixed so the browser path can sign in as a mentor; the admin seed keeps its printed random passwords. */
export const DEMO_MENTOR_PASSWORD = "demo-seed-not-a-real-password-1";

export const DEMO_MENTOR_EMAILS = [
  "ayesha.rahman@example.edu.bd",
  "tanvir.hossain@example.edu.bd",
] as const;
