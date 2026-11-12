/**
 * The platform-admin institution surface (spec: institutions/onboarding).
 * Creation stops at the institution and its domains: assigning an institution
 * admin stays on `POST /v1/admin/institutions/{id}/admins` (D-109).
 */

export const INSTITUTION_KINDS = [
  "UNIVERSITY",
  "BOOTCAMP",
  "TRAINING_INSTITUTE",
  "OTHER",
] as const;

export type InstitutionKindValue = (typeof INSTITUTION_KINDS)[number];

/** Field bounds (design R4), stated here and mirrored in the contract. */
export const INSTITUTION_NAME_MAX_LENGTH = 160;
export const INSTITUTION_DOMAIN_MAX_ENTRIES = 20;
export const INSTITUTION_DOMAIN_MIN_LENGTH = 3;
export const INSTITUTION_DOMAIN_MAX_LENGTH = 253;

export interface InstitutionRecord {
  id: string;
  name: string;
  kind: InstitutionKindValue;
  countryCode: string;
  status: "ONBOARDING" | "ACTIVE" | "SUSPENDED";
  /** `YYYY-MM-DD`, or null when the MoU is not signed yet. */
  mouSignedOn: string | null;
  domains: string[];
}

export interface CreateInstitutionInput {
  name: unknown;
  kind: unknown;
  countryCode: unknown;
  mouSignedOn: unknown;
  domains: unknown;
  actorUserId: string;
  requestId: string;
}

export interface InstitutionsService {
  /** Creates the institution, its domains and both audit kinds in one transaction. */
  createInstitution(input: CreateInstitutionInput): Promise<InstitutionRecord>;
  /** Every institution with its domains, ordered by name then id. */
  listInstitutions(): Promise<InstitutionRecord[]>;
}

/** The wire shape; the key set is asserted by the integration test. */
export function institutionPayload(record: InstitutionRecord): Record<string, unknown> {
  return {
    id: record.id,
    name: record.name,
    kind: record.kind,
    country_code: record.countryCode,
    status: record.status,
    mou_signed_on: record.mouSignedOn,
    domains: record.domains,
  };
}
