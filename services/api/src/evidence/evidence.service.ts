import type { Role } from "@connect/domain";

/** The three states a stored file can be in (docs/data-model.md §4.1). */
export const EVIDENCE_STATUSES = ["QUARANTINED", "CLEAN", "REJECTED"] as const;
export type EvidenceStatus = (typeof EVIDENCE_STATUSES)[number];

export interface EvidenceRecord {
  id: string;
  outcomeId: string;
  /** The object's key in the private bucket; never returned to a caller. */
  objectKey: string;
  status: EvidenceStatus;
  contentType: string;
  sizeBytes: number;
  sha256: string;
  scannedAt: Date | null;
  uploadedAt: Date | null;
  deletedAt: Date | null;
  createdAt: Date;
}

export interface CreateEvidenceIntentInput {
  userId: string;
  outcomeId: string;
  /** The declared type and digest are inputs, never facts (design, trust boundary). */
  contentType: string | undefined;
  sizeBytes: number | undefined;
  sha256: string | undefined;
  requestId: string;
}

export interface CompleteEvidenceInput {
  userId: string;
  outcomeId: string;
  evidenceId: string;
  bytes: Buffer;
  requestId: string;
}

export interface ReadEvidenceInput {
  userId: string;
  roles: readonly Role[];
  /** True when the caller holds PLATFORM_ADMIN and an active second factor. */
  adminWithMfa: boolean;
  outcomeId: string;
  evidenceId: string;
  requestId: string;
}

export interface EvidenceLink {
  record: EvidenceRecord;
  /** Present only for a clean, undeleted file. */
  url: string | null;
}

export interface EvidenceService {
  createIntent(input: CreateEvidenceIntentInput): Promise<EvidenceRecord>;
  completeUpload(input: CompleteEvidenceInput): Promise<EvidenceRecord>;
  read(input: ReadEvidenceInput): Promise<EvidenceLink>;
}

/** The wire shape; `url` is non-null only when the file may be served. */
export function evidencePayload(link: EvidenceLink): Record<string, unknown> {
  const { record } = link;
  return {
    id: record.id,
    outcome_id: record.outcomeId,
    status: record.status.toLowerCase(),
    content_type: record.contentType,
    size_bytes: record.sizeBytes,
    sha256: record.sha256,
    scanned_at: record.scannedAt?.toISOString() ?? null,
    uploaded_at: record.uploadedAt?.toISOString() ?? null,
    created_at: record.createdAt.toISOString(),
    url: link.url,
  };
}
