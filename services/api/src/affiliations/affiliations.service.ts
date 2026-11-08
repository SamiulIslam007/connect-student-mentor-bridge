import type {
  AffiliationKind,
  AffiliationLevel,
} from "@connect/domain";

/** What the claim endpoint and `GET /v1/me` expose. Ids are opaque. */
export interface AffiliationRecord {
  id: string;
  institutionId: string | null;
  institutionName: string | null;
  kind: AffiliationKind;
  level: AffiliationLevel;
  method: "INSTITUTIONAL_EMAIL" | "ADMIN_ATTESTATION" | "EMPLOYER_EMAIL" | "PROFESSIONAL_LINK";
  status: "PENDING" | "VERIFIED" | "REJECTED" | "REVOKED" | "EXPIRED";
  department: string | null;
  program: string | null;
  batchYear: number | null;
  verifiedAt: Date | null;
  revokedAt: Date | null;
}

export interface ClaimAffiliationInput {
  /** The acting account, always from the session. */
  userId: string;
  /** Optional: when absent the institution is resolved from the email domain. */
  institutionId?: string;
  kind: AffiliationKind;
  department?: string;
  program?: string;
  batchYear?: number;
  requestId: string;
}

export interface ClaimAffiliationResult {
  affiliation: AffiliationRecord;
  /** False when an identical claim already existed (idempotent repeat). */
  created: boolean;
}

export interface AffiliationsService {
  claim(input: ClaimAffiliationInput): Promise<ClaimAffiliationResult>;
  /** The caller's own rows, newest first, including revoked history. */
  listMine(userId: string): Promise<AffiliationRecord[]>;
}

/** Wire shape: snake_case and the mechanical lowercase enum values. */
export function affiliationPayload(affiliation: AffiliationRecord): Record<string, unknown> {
  return {
    id: affiliation.id,
    institution: affiliation.institutionId
      ? { id: affiliation.institutionId, name: affiliation.institutionName }
      : null,
    kind: affiliation.kind.toLowerCase(),
    level: affiliation.level.toLowerCase(),
    method: affiliation.method.toLowerCase(),
    status: affiliation.status.toLowerCase(),
    department: affiliation.department,
    program: affiliation.program,
    batch_year: affiliation.batchYear,
    verified_at: affiliation.verifiedAt,
    revoked_at: affiliation.revokedAt,
  };
}
