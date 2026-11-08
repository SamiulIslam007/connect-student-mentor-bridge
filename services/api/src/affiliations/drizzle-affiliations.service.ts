import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq, inArray } from "drizzle-orm";

import {
  AFFILIATION_KINDS,
  IdentityError,
  emailDomainOf,
  resolveAffiliationClaim,
  type AffiliationKind,
} from "@connect/domain";

import { DATABASE } from "../db/database.module.js";
import type { Database } from "../db/database.js";
import {
  affiliations,
  institutionDomains,
  institutions,
  users,
} from "../db/schema/index.js";
import { appendAuditEntry } from "../identity/audit-log.js";
import { syncMentorActivation } from "../onboarding/mentor-activation.js";
import type {
  AffiliationRecord,
  AffiliationsService,
  ClaimAffiliationInput,
  ClaimAffiliationResult,
} from "./affiliations.service.js";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
type Executor = Pick<Database, "select">;

const MAX_TEXT_LENGTH = 120;

/** Optional free text: blank and absent both read as null. */
function optionalText(value: string | undefined, field: string): string | null {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed.length > MAX_TEXT_LENGTH) {
    throw new IdentityError("VALIDATION_ERROR", `${field} must be at most ${MAX_TEXT_LENGTH} characters`);
  }
  return trimmed;
}

function validatedKind(value: unknown): AffiliationKind {
  if (typeof value === "string" && (AFFILIATION_KINDS as readonly string[]).includes(value)) {
    return value as AffiliationKind;
  }
  throw new IdentityError("VALIDATION_ERROR", "kind must be alumnus, student, faculty_staff, or employee");
}

function validatedBatchYear(value: unknown): number | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1900 || value > 2200) {
    throw new IdentityError("VALIDATION_ERROR", "batch_year must be a whole year from 1900 to 2200");
  }
  return value;
}

function recordOf(row: {
  id: string;
  institutionId: string | null;
  institutionName: string | null;
  kind: AffiliationRecord["kind"];
  level: AffiliationRecord["level"];
  method: AffiliationRecord["method"];
  status: AffiliationRecord["status"];
  department: string | null;
  program: string | null;
  batchYear: number | null;
  verifiedAt: Date | null;
  revokedAt: Date | null;
}): AffiliationRecord {
  return { ...row };
}

async function readRecord(executor: Executor, id: string): Promise<AffiliationRecord> {
  const [row] = await executor
    .select({
      id: affiliations.id,
      institutionId: affiliations.institutionId,
      institutionName: institutions.name,
      kind: affiliations.kind,
      level: affiliations.level,
      method: affiliations.method,
      status: affiliations.status,
      department: affiliations.department,
      program: affiliations.program,
      batchYear: affiliations.batchYear,
      verifiedAt: affiliations.verifiedAt,
      revokedAt: affiliations.revokedAt,
    })
    .from(affiliations)
    .leftJoin(institutions, eq(institutions.id, affiliations.institutionId))
    .where(eq(affiliations.id, id))
    .limit(1);
  if (!row) {
    throw new Error("the affiliation disappeared after it was written");
  }
  return recordOf(row);
}

/**
 * The institution is the one the caller names, or — when the body names none —
 * the one their verified email domain belongs to (design D2). Either way the
 * level is decided by `resolveAffiliationClaim`, never by the body.
 */
async function resolveInstitution(
  tx: Transaction,
  input: ClaimAffiliationInput,
  email: string,
): Promise<{ id: string; name: string }> {
  if (input.institutionId) {
    const [named] = await tx
      .select({ id: institutions.id, name: institutions.name })
      .from(institutions)
      .where(eq(institutions.id, input.institutionId))
      .limit(1);
    if (!named) {
      throw new IdentityError("AFFILIATION_INSTITUTION_MISMATCH", "the institution does not exist");
    }
    return named;
  }

  const domain = emailDomainOf(email);
  if (!domain) {
    throw new IdentityError("AFFILIATION_INSTITUTION_MISMATCH", "the account email has no domain");
  }
  const [resolved] = await tx
    .select({ id: institutions.id, name: institutions.name })
    .from(institutionDomains)
    .innerJoin(institutions, eq(institutions.id, institutionDomains.institutionId))
    .where(eq(institutionDomains.domain, domain))
    .limit(1);
  if (!resolved) {
    throw new IdentityError(
      "AFFILIATION_INSTITUTION_MISMATCH",
      "the account email domain is not registered to an institution",
    );
  }
  return resolved;
}

@Injectable()
export class DrizzleAffiliationsService implements AffiliationsService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async claim(input: ClaimAffiliationInput): Promise<ClaimAffiliationResult> {
    const kind = validatedKind(input.kind);
    const department = optionalText(input.department, "department");
    const program = optionalText(input.program, "program");
    const batchYear = validatedBatchYear(input.batchYear);

    return await this.db.transaction(async (tx) => {
      // One claim at a time per account: the supersede rule must not race.
      const [account] = await tx
        .select({ email: users.email, emailVerified: users.emailVerified })
        .from(users)
        .where(eq(users.id, input.userId))
        .for("update")
        .limit(1);
      if (!account) {
        throw new IdentityError("SESSION_INVALID", "the session is not valid");
      }

      const institution = await resolveInstitution(tx, input, account.email);
      const domains = await tx
        .select({ domain: institutionDomains.domain })
        .from(institutionDomains)
        .where(eq(institutionDomains.institutionId, institution.id));

      const decision = resolveAffiliationClaim({
        email: account.email,
        emailVerified: account.emailVerified,
        registeredDomains: domains.map((row) => row.domain),
      });
      if (!decision.granted) {
        throw new IdentityError(decision.code, "confirm your email address before claiming an affiliation");
      }

      const [existing] = await tx
        .select({ id: affiliations.id })
        .from(affiliations)
        .where(
          and(
            eq(affiliations.userId, input.userId),
            eq(affiliations.institutionId, institution.id),
            inArray(affiliations.status, ["VERIFIED", "PENDING"]),
          ),
        )
        .limit(1);
      if (existing) {
        return { affiliation: await readRecord(tx, existing.id), created: false };
      }

      const now = new Date();
      const revoked = await tx
        .update(affiliations)
        .set({ status: "REVOKED", revokedAt: now, updatedAt: now })
        .where(and(eq(affiliations.userId, input.userId), eq(affiliations.status, "VERIFIED")))
        .returning({ id: affiliations.id });
      for (const row of revoked) {
        await appendAuditEntry(tx, {
          action: "AFFILIATION_REVOKED",
          actorUserId: input.userId,
          actorRole: "USER",
          objectType: "AFFILIATION",
          objectId: row.id,
          requestId: input.requestId,
          reason: "superseded by a new affiliation claim",
        });
      }

      const [inserted] = await tx
        .insert(affiliations)
        .values({
          userId: input.userId,
          institutionId: institution.id,
          kind,
          department,
          program,
          batchYear,
          level: decision.level,
          method: decision.method,
          status: decision.status,
          verifiedAt: decision.status === "VERIFIED" ? now : null,
        })
        .returning({ id: affiliations.id });
      if (!inserted) {
        throw new Error("the affiliation insert returned no row");
      }

      await appendAuditEntry(tx, {
        action: "AFFILIATION_GRANTED",
        actorUserId: input.userId,
        actorRole: "USER",
        objectType: "AFFILIATION",
        objectId: inserted.id,
        requestId: input.requestId,
        reason: "institutional email claim",
        metadata: { level: decision.level, status: decision.status, method: decision.method },
      });

      await syncMentorActivation(tx, input.userId);

      return { affiliation: await readRecord(tx, inserted.id), created: true };
    });
  }

  async listMine(userId: string): Promise<AffiliationRecord[]> {
    const rows = await this.db
      .select({
        id: affiliations.id,
        institutionId: affiliations.institutionId,
        institutionName: institutions.name,
        kind: affiliations.kind,
        level: affiliations.level,
        method: affiliations.method,
        status: affiliations.status,
        department: affiliations.department,
        program: affiliations.program,
        batchYear: affiliations.batchYear,
        verifiedAt: affiliations.verifiedAt,
        revokedAt: affiliations.revokedAt,
      })
      .from(affiliations)
      .leftJoin(institutions, eq(institutions.id, affiliations.institutionId))
      .where(eq(affiliations.userId, userId))
      .orderBy(desc(affiliations.createdAt));
    return rows.map(recordOf);
  }
}
