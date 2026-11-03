import type { AccountStatus } from "./identity.js";

/**
 * What a sign-in may do next, decided from the account status alone
 * (design D2/D5). A pure function: no clock, no database, no request.
 */
export type AccountStatusDecision =
  | { action: "ALLOW" }
  | { action: "ACTIVATE_THEN_ALLOW" }
  | { action: "REFUSE"; code: "EMAIL_NOT_VERIFIED" | "ACCOUNT_SUSPENDED" | "FORBIDDEN" };

/**
 * Only `ACTIVE` may hold a session. `PENDING` is refused by the library's
 * verification gate first; `DEACTIVATED` is a pause that signing in ends
 * (design D5); every other state refuses.
 */
export function decideSignIn(status: AccountStatus): AccountStatusDecision {
  switch (status) {
    case "ACTIVE":
      return { action: "ALLOW" };
    case "DEACTIVATED":
      return { action: "ACTIVATE_THEN_ALLOW" };
    case "PENDING":
      return { action: "REFUSE", code: "EMAIL_NOT_VERIFIED" };
    case "SUSPENDED":
      return { action: "REFUSE", code: "ACCOUNT_SUSPENDED" };
    case "DELETION_PENDING":
    case "ANONYMIZED":
      return { action: "REFUSE", code: "FORBIDDEN" };
  }
}
