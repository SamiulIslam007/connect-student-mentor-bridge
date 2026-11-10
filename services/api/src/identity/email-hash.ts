import { createHmac } from "node:crypto";

/**
 * The keyed email hash (`BETTER_AUTH_SECRET`). Shared by the signup block and
 * the account tombstone, so a deleted address hashes to the value the 12-month
 * block already holds (design D4 of `privacy-export-and-erasure`).
 */
export function hashEmail(secret: string, email: string): string {
  return createHmac("sha256", secret).update(email.trim().toLowerCase()).digest("hex");
}
