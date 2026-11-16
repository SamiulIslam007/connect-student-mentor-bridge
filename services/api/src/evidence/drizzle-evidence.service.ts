import { createHash, randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";

import { IdentityError, type Role } from "@connect/domain";

import type { Database } from "../db/database.js";
import { mentorProfiles, outcomeEvidence, outcomes, studentProfiles } from "../db/schema/index.js";
import { appendAuditEntry } from "../identity/audit-log.js";
import { EVIDENCE_CONTENT_TYPES, EVIDENCE_MAX_BYTES } from "../http/request-body.js";
import type {
  CompleteEvidenceInput,
  CreateEvidenceIntentInput,
  EvidenceLink,
  EvidenceRecord,
  EvidenceService,
  ReadEvidenceInput,
} from "./evidence.service.js";
import { createEvidenceStorage, type EvidenceStorage } from "./storage.js";
const SHA256_PATTERN = /^[0-9a-f]{64}$/i;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A path id that is not a uuid names nothing, so it is a `404`, never a 500. */
function requireUuid(id: string): void {
  if (!UUID_PATTERN.test(id)) {
    throw new IdentityError("SESSION_NOT_FOUND", "the outcome does not exist");
  }
}

const recordColumns = {
  id: outcomeEvidence.id,
  outcomeId: outcomeEvidence.outcomeId,
  objectKey: outcomeEvidence.objectKey,
  status: outcomeEvidence.status,
  contentType: outcomeEvidence.contentType,
  sizeBytes: outcomeEvidence.sizeBytes,
  sha256: outcomeEvidence.sha256,
  scannedAt: outcomeEvidence.scannedAt,
  uploadedAt: outcomeEvidence.uploadedAt,
  deletedAt: outcomeEvidence.deletedAt,
  createdAt: outcomeEvidence.createdAt,
};

type Executor = Pick<Database, "select" | "insert" | "update">;

function recordOf(row: Record<string, unknown> | undefined): EvidenceRecord {
  if (!row) {
    throw new IdentityError("SESSION_NOT_FOUND", "the evidence does not exist");
  }
  return row as unknown as EvidenceRecord;
}

/** The outcome's two participants, or null when the outcome does not exist. */
async function readParticipants(executor: Executor, outcomeId: string) {
  const [row] = await executor
    .select({
      id: outcomes.id,
      studentUserId: studentProfiles.userId,
      mentorUserId: mentorProfiles.userId,
    })
    .from(outcomes)
    .innerJoin(studentProfiles, eq(studentProfiles.id, outcomes.studentProfileId))
    .innerJoin(mentorProfiles, eq(mentorProfiles.id, outcomes.mentorProfileId))
    .where(eq(outcomes.id, outcomeId))
    .limit(1);
  return row ?? null;
}

/**
 * A caller who is not the reporting student gets `404` when they are not on the
 * mentorship and `403` when they are (spec: only the student attaches evidence).
 */
function refuseNonStudent(
  participants: { studentUserId: string; mentorUserId: string },
  userId: string,
): void {
  if (participants.studentUserId === userId) {
    return;
  }
  if (participants.mentorUserId === userId) {
    throw new IdentityError("ROLE_REQUIRED", "only the reporting student attaches evidence");
  }
  throw new IdentityError("SESSION_NOT_FOUND", "the outcome does not exist");
}

/** The bytes' own type; a declared type that disagrees is not trusted. */
function sniffContentType(bytes: Buffer): string | null {
  if (bytes.subarray(0, 5).toString("latin1") === "%PDF-") {
    return "application/pdf";
  }
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return "image/png";
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  return null;
}

function digestOf(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** Drizzle wraps a driver error, so the sqlstate is on the error or its cause. */
function postgresCode(error: unknown): string | undefined {
  const direct = (error as { code?: unknown }).code;
  if (typeof direct === "string") {
    return direct;
  }
  const cause = (error as { cause?: { code?: unknown } }).cause;
  return typeof cause?.code === "string" ? cause.code : undefined;
}

export class DrizzleEvidenceService implements EvidenceService {
  private readonly storage: EvidenceStorage | null;

  constructor(
    private readonly db: Database,
    storage: EvidenceStorage | null = createEvidenceStorage(),
  ) {
    this.storage = storage;
  }

  private requireStorage(): EvidenceStorage {
    if (!this.storage) {
      throw new IdentityError("EVIDENCE_UNAVAILABLE", "file storage is not configured");
    }
    return this.storage;
  }

  async createIntent(input: CreateEvidenceIntentInput): Promise<EvidenceRecord> {
    this.requireStorage();
    requireUuid(input.outcomeId);

    const contentType = input.contentType?.trim() ?? "";
    if (!(EVIDENCE_CONTENT_TYPES as readonly string[]).includes(contentType)) {
      throw new IdentityError(
        "VALIDATION_ERROR",
        `content_type must be one of ${EVIDENCE_CONTENT_TYPES.join(", ")}`,
      );
    }
    const sizeBytes = input.sizeBytes;
    if (
      typeof sizeBytes !== "number" ||
      !Number.isInteger(sizeBytes) ||
      sizeBytes < 1 ||
      sizeBytes > EVIDENCE_MAX_BYTES
    ) {
      throw new IdentityError(
        "VALIDATION_ERROR",
        `size_bytes must be a whole number from 1 to ${EVIDENCE_MAX_BYTES}`,
      );
    }
    const sha256 = input.sha256?.trim().toLowerCase() ?? "";
    if (!SHA256_PATTERN.test(sha256)) {
      throw new IdentityError("VALIDATION_ERROR", "sha256 must be 64 hexadecimal characters");
    }
    if (!input.outcomeId) {
      throw new IdentityError("SESSION_NOT_FOUND", "the outcome does not exist");
    }

    return await this.db.transaction(async (tx) => {
      const participants = await readParticipants(tx, input.outcomeId);
      if (!participants) {
        throw new IdentityError("SESSION_NOT_FOUND", "the outcome does not exist");
      }
      refuseNonStudent(participants, input.userId);

      const id = randomUUID();
      try {
        const [inserted] = await tx
          .insert(outcomeEvidence)
          .values({
            id,
            outcomeId: input.outcomeId,
            uploadedByUserId: input.userId,
            // The key carries the id, so one row maps to exactly one object.
            objectKey: `outcome-evidence/${input.outcomeId}/${id}`,
            sha256,
            sizeBytes,
            contentType,
            status: "QUARANTINED",
          })
          .returning(recordColumns);
        return recordOf(inserted);
      } catch (error) {
        if (postgresCode(error) === "23505") {
          throw new IdentityError(
            "EVIDENCE_ALREADY_ATTACHED",
            "this outcome already has an evidence file",
          );
        }
        throw error;
      }
    });
  }

  async completeUpload(input: CompleteEvidenceInput): Promise<EvidenceRecord> {
    const storage = this.requireStorage();
    requireUuid(input.outcomeId);
    requireUuid(input.evidenceId);

    return await this.db.transaction(async (tx) => {
      const participants = await readParticipants(tx, input.outcomeId);
      if (!participants) {
        throw new IdentityError("SESSION_NOT_FOUND", "the outcome does not exist");
      }
      refuseNonStudent(participants, input.userId);

      const [row] = await tx
        .select(recordColumns)
        .from(outcomeEvidence)
        .where(and(eq(outcomeEvidence.id, input.evidenceId), eq(outcomeEvidence.outcomeId, input.outcomeId)))
        .limit(1)
        .for("update");
      if (!row) {
        throw new IdentityError("SESSION_NOT_FOUND", "the evidence does not exist");
      }
      if (row.uploadedAt) {
        throw new IdentityError("EVIDENCE_ALREADY_COMPLETED", "this upload was already completed");
      }
      if (row.deletedAt) {
        throw new IdentityError("EVIDENCE_NOT_READY", "this file is no longer available");
      }

      const now = new Date();
      const actualSha = digestOf(input.bytes);
      const sniffed = sniffContentType(input.bytes);
      const mismatch =
        input.bytes.length < 1 ||
        input.bytes.length !== row.sizeBytes ||
        actualSha !== row.sha256 ||
        sniffed !== row.contentType;
      if (mismatch) {
        // The bytes are never stored: the record is refused, not served later.
        const [rejected] = await tx
          .update(outcomeEvidence)
          .set({
            status: "REJECTED",
            scannedAt: now,
            uploadedAt: now,
            scanDetail: "the received bytes did not match the declared type, size or digest",
            updatedAt: now,
          })
          .where(eq(outcomeEvidence.id, row.id))
          .returning(recordColumns);
        return recordOf(rejected);
      }

      try {
        await storage.put(row.objectKey, input.bytes, row.contentType);
        const [completed] = await tx
          .update(outcomeEvidence)
          .set({ uploadedAt: now, updatedAt: now })
          .where(eq(outcomeEvidence.id, row.id))
          .returning(recordColumns);
        return recordOf(completed);
      } catch (error) {
        // An object store cannot join the transaction: drop the bytes if the row
        // is not going to name them, so no unscanned orphan is left behind.
        await storage.delete(row.objectKey).catch(() => undefined);
        throw error;
      }
    });
  }

  async read(input: ReadEvidenceInput): Promise<EvidenceLink> {
    const storage = this.requireStorage();
    requireUuid(input.outcomeId);
    requireUuid(input.evidenceId);

    const participants = await readParticipants(this.db, input.outcomeId);
    if (!participants) {
      throw new IdentityError("SESSION_NOT_FOUND", "the outcome does not exist");
    }
    const isStudent = participants.studentUserId === input.userId;
    const isMentor = participants.mentorUserId === input.userId;
    const isAdmin = input.roles.includes("PLATFORM_ADMIN" as Role);
    if (!isStudent && !isMentor && !isAdmin) {
      throw new IdentityError("SESSION_NOT_FOUND", "the outcome does not exist");
    }
    if (isAdmin && !isStudent && !input.adminWithMfa) {
      throw new IdentityError("MFA_REQUIRED", "this action requires an enrolled second factor");
    }

    const [row] = await this.db
      .select(recordColumns)
      .from(outcomeEvidence)
      .where(
        and(eq(outcomeEvidence.id, input.evidenceId), eq(outcomeEvidence.outcomeId, input.outcomeId)),
      )
      .limit(1);
    if (!row) {
      throw new IdentityError("SESSION_NOT_FOUND", "the evidence does not exist");
    }
    const record = row as unknown as EvidenceRecord;
    if (record.status !== "CLEAN" || record.deletedAt) {
      throw new IdentityError("EVIDENCE_NOT_READY", "this file is not available yet");
    }

    // An admin's link is audited before it is produced (design R6); a student's
    // and a mentor's read are not (FR-OUT-02).
    const audited = isAdmin && !isStudent;
    if (audited) {
      await appendAuditEntry(this.db, {
        action: "EVIDENCE_VIEWED",
        actorUserId: input.userId,
        actorRole: "PLATFORM_ADMIN",
        objectType: "outcome_evidence",
        objectId: record.id,
        requestId: input.requestId,
        // An admin reading a student's private document is a read that widens
        // access, which is what the break-glass flag marks (D-124).
        breakGlass: true,
        metadata: { outcome_id: record.outcomeId },
      });
    }

    return { record, url: await storage.presignGet(record.objectKey) };
  }
}
