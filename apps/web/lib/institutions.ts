import { strings } from "./strings";

/** The kinds the API accepts, in the order the form shows them. */
export const INSTITUTION_KIND_OPTIONS = [
  { value: "UNIVERSITY", label: "University" },
  { value: "BOOTCAMP", label: "Bootcamp" },
  { value: "TRAINING_INSTITUTE", label: "Training institute" },
  { value: "OTHER", label: "Other" },
] as const;

export interface InstitutionRow {
  id: string;
  name: string;
  kind: string;
  country_code: string;
  status: string;
  mou_signed_on: string | null;
  domains: string[];
}

export interface InstitutionDraft {
  name: string;
  kind: string;
  countryCode: string;
  mouSignedOn: string;
  /** Comma-separated, as the form collects them. */
  domains: string;
}

export type DraftCheck =
  | { ok: true; body: Record<string, unknown> }
  | { ok: false; error: string };

const COUNTRY_PATTERN = /^[A-Za-z]{2}$/;
const DOMAIN_PATTERN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

/**
 * Builds the create body, refusing what the API would refuse first, so a typo
 * is a field message instead of a round trip (the API still owns the rules).
 */
export function createInstitutionBody(draft: InstitutionDraft): DraftCheck {
  const name = draft.name.trim();
  if (!name) {
    return { ok: false, error: strings.adminInstitutions.nameRequired };
  }
  if (name.length > 160) {
    return { ok: false, error: strings.adminInstitutions.nameTooLong };
  }
  const countryCode = draft.countryCode.trim().toUpperCase();
  if (!COUNTRY_PATTERN.test(countryCode)) {
    return { ok: false, error: strings.adminInstitutions.countryInvalid };
  }

  const domains = draft.domains
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);
  if (domains.length > 20) {
    return { ok: false, error: strings.adminInstitutions.tooManyDomains };
  }
  for (const domain of domains) {
    if (domain.length < 3 || domain.length > 253 || !DOMAIN_PATTERN.test(domain)) {
      return { ok: false, error: strings.adminInstitutions.domainInvalid };
    }
  }

  const mouSignedOn = draft.mouSignedOn.trim();
  return {
    ok: true,
    body: {
      name,
      kind: draft.kind,
      country_code: countryCode,
      ...(mouSignedOn ? { mou_signed_on: mouSignedOn } : {}),
      ...(domains.length > 0 ? { domains } : {}),
    },
  };
}

/** A malformed payload reads as an empty list, never as a crash. */
export function institutionRows(payload: unknown): InstitutionRow[] {
  const data = (payload as { data?: unknown } | null)?.data;
  if (!Array.isArray(data)) {
    return [];
  }
  return data.flatMap((entry) => {
    const row = entry as Partial<InstitutionRow> | null;
    if (!row || typeof row.id !== "string" || typeof row.name !== "string") {
      return [];
    }
    return [
      {
        id: row.id,
        name: row.name,
        kind: typeof row.kind === "string" ? row.kind : "",
        country_code: typeof row.country_code === "string" ? row.country_code : "",
        status: typeof row.status === "string" ? row.status : "",
        mou_signed_on: typeof row.mou_signed_on === "string" ? row.mou_signed_on : null,
        domains: Array.isArray(row.domains) ? row.domains.filter((d): d is string => typeof d === "string") : [],
      },
    ];
  });
}

/** `status · domains`, so one line carries both without a table. */
export function institutionSummary(row: InstitutionRow): string {
  const domains = row.domains.length > 0 ? row.domains.join(", ") : strings.adminInstitutions.noDomains;
  return `${row.status} · ${row.country_code} · ${domains}`;
}

/** The API's refusal when the email has no account (drizzle-attestation resolveGrantTarget). */
const NO_ACCOUNT_DETAIL = "email must belong to an existing account";

/**
 * The grant body, and whether it is worth sending: an empty or malformed email
 * is refused here so the page does not spend a request on it.
 */
export function adminAssignmentPayload(input: string): {
  body: { email: string };
  valid: boolean;
} {
  const email = input.trim().toLowerCase();
  return { body: { email }, valid: /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) };
}

/** One line under the row: the specific refusal, or the generic one. */
export function adminAssignmentError(status: number, detail: string | undefined): string {
  if (status === 403) {
    return strings.adminInstitutions.adminForbidden;
  }
  if (status === 404) {
    return strings.adminInstitutions.adminNotFound;
  }
  if (status === 422 && detail === NO_ACCOUNT_DETAIL) {
    return strings.adminInstitutions.adminNoAccount;
  }
  return strings.adminInstitutions.adminFailure;
}
