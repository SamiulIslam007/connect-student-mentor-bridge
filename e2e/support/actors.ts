import { randomUUID } from "node:crypto";

import {
  DEMO_MENTOR_EMAILS,
  DEMO_MENTOR_PASSWORD,
  DEMO_TOTP_SECRET,
} from "../../services/api/src/db/seed/demo-constants.ts";

export interface Actor {
  email: string;
  password: string;
  displayName: string;
}

/**
 * A student per run: the address is random but printed, so a failed run names
 * the account it created and the next run cannot collide with it.
 */
export function newStudent(): Actor {
  const id = randomUUID().slice(0, 8);
  const run = process.env.E2E_RUN_ID ?? new Date().toISOString().replace(/\D/g, "").slice(0, 14);
  return {
    email: `e2e-${run}-${id}@example.com`,
    password: "e2e-student-password-1",
    displayName: "E2E Student",
  };
}

/** The seeded mentor: fixed values from the seed module, never copied (D-236). */
export const mentor = {
  email: DEMO_MENTOR_EMAILS[0],
  // The directory card the request must be sent from, checked against the seed by
  // `support/prepare.ts` so a renamed demo mentor fails loudly.
  displayName: "Ayesha Rahman",
  password: DEMO_MENTOR_PASSWORD,
  totpSecret: DEMO_TOTP_SECRET,
};
