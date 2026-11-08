/**
 * Affiliation rules (docs/data-model.md §4.1, §5.1). Pure: no database or HTTP
 * import. Level 1 is granted only from a verified institutional email domain
 * (FR-VER-01, design D2).
 */

export const AFFILIATION_LEVELS = ["LEVEL_0", "LEVEL_1", "LEVEL_2"] as const;
export type AffiliationLevel = (typeof AFFILIATION_LEVELS)[number];

export const AFFILIATION_KINDS = ["ALUMNUS", "STUDENT", "FACULTY_STAFF", "EMPLOYEE"] as const;
export type AffiliationKind = (typeof AFFILIATION_KINDS)[number];

/** The domain of an address, lowercased and trimmed; null when there is none. */
export function emailDomainOf(email: string): string | null {
  const trimmed = email.trim().toLowerCase();
  const at = trimmed.lastIndexOf("@");
  const domain = at > 0 ? trimmed.slice(at + 1) : "";
  return domain.length > 0 ? domain : null;
}

export type AffiliationClaim =
  | { granted: false; code: "AFFILIATION_EMAIL_UNVERIFIED" }
  | { granted: true; level: AffiliationLevel; method: "INSTITUTIONAL_EMAIL"; status: "PENDING" | "VERIFIED" };

/**
 * A verified address whose domain the institution registered gets Level 1;
 * every other claim is stored pending at Level 0. An unverified address never
 * grants a level, whatever its domain says.
 */
export function resolveAffiliationClaim(input: {
  email: string;
  emailVerified: boolean;
  registeredDomains: readonly string[];
}): AffiliationClaim {
  if (!input.emailVerified) {
    return { granted: false, code: "AFFILIATION_EMAIL_UNVERIFIED" };
  }
  const domain = emailDomainOf(input.email);
  const matches =
    domain !== null &&
    input.registeredDomains.some((registered) => registered.trim().toLowerCase() === domain);
  return matches
    ? { granted: true, level: "LEVEL_1", method: "INSTITUTIONAL_EMAIL", status: "VERIFIED" }
    : { granted: true, level: "LEVEL_0", method: "INSTITUTIONAL_EMAIL", status: "PENDING" };
}

/** "Level 1 or above": the request gate in #7 reads this, not a string compare. */
export function hasLevelOne(level: AffiliationLevel | null | undefined): boolean {
  return level === "LEVEL_1" || level === "LEVEL_2";
}
