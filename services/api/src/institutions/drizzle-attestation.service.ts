import { Inject, Injectable } from "@nestjs/common";
import { and, asc, eq, inArray, isNotNull, sql } from "drizzle-orm";

import {
  IdentityError,
  type AffiliationKind,
  type AffiliationLevel,
} from "@connect/domain";

import { DATABASE } from "../db/database.module.js";
import type { Database } from "../db/database.js";
import { affiliations, institutions, users } from "../db/schema/index.js";
import { appendAuditEntry } from "../identity/audit-log.js";
import { syncMentorActivation } from "../onboarding/mentor-activation.js";
import { expireRequestsWithoutVerifiedAffiliation } from "../affiliations/affiliation-expiry.js";
import { enqueueOutboxEvent } from "../platform/outbox/outbox.js";
import {
  CLAIM_DECISIONS,
  DECISION_REASON_MAX_LENGTH,
  type AttestationsService,
  type ClaimDecision,
  type DecideClaimInput,
  type DecidedClaimRecord,
  type PendingClaimRecord,
} from "./attestations.service.js";

function validatedDecision(value: unknown): ClaimDecision {
  if (typeof value === "string" && (CLAIM_DECISIONS as readonly string[]).includes(value)) {
    return value as ClaimDecision;
  }
  throw new IdentityError("VALIDATION_ERROR", "decision must be verify or reject");
}

/** The reason is required on both decisions and bounded by the field limit. */
function validatedReason(value: unknown): string {
  const reason = typeof value === "string" ? value.trim() : "";
  if (!reason) {
    throw new IdentityError("VALIDATION_ERROR", "reason is required");
  }
  if (reason.length > DECISION_REASON_MAX_LENGTH) {
    throw new IdentityError(
      "VALIDATION_ERROR",
      `reason must be at most ${DECISION_REASON_MAX_LENGTH} characters`,
    );
  }
  return reason;
}

@Injectable()
export class DrizzleAttestationsService implements AttestationsService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async listPendingClaims(institutionIds: string[]): Promise<PendingClaimRecord[]> {
    if (institutionIds.length === 0) {
      return [];
    }
    const rows = await this.db
      .select({
        id: affiliations.id,
        applicantName: users.name,
        // D-101: the local part never leaves the database.
        emailDomain: sql<string | null>`nullif(split_part(${users.email}, '@', 2), '')`,
        kind: affiliations.kind,
        department: affiliations.department,
        program: affiliations.program,
        batchYear: affiliations.batchYear,
        claimedAt: affiliations.createdAt,
      })
      .from(affiliations)
      .innerJoin(users, eq(users.id, affiliations.userId))
      .where(
        and(
          eq(affiliations.status, "PENDING"),
          isNotNull(affiliations.institutionId),
          inArray(affiliations.institutionId, institutionIds),
        ),
      )
      .orderBy(asc(affiliations.id));

    return rows.map((row) => ({
      id: row.id,
      applicantName: row.applicantName,
      emailDomain: row.emailDomain,
      kind: row.kind as AffiliationKind,
      department: row.department,
      program: row.program,
      batchYear: row.batchYear,
      claimedAt: row.claimedAt,
    }));
  }

  async decideClaim(input: DecideClaimInput): Promise<DecidedClaimRecord> {
    const decision = validatedDecision(input.decision);
    const reason = validatedReason(input.reason);

    return await this.db.transaction(async (tx) => {
      const [claim] = await tx
        .select({
          id: affiliations.id,
          userId: affiliations.userId,
          status: affiliations.status,
          level: affiliations.level,
          method: affiliations.method,
          email: users.email,
          institutionName: institutions.name,
        })
        .from(affiliations)
        .innerJoin(users, eq(users.id, affiliations.userId))
        .innerJoin(institutions, eq(institutions.id, affiliations.institutionId))
        .where(
          and(
            eq(affiliations.id, input.claimId),
            inArray(affiliations.institutionId, input.institutionIds),
          ),
        )
        .for("update", { of: affiliations })
        .limit(1);

      // Absent or outside the caller's scope is the same answer: no disclosure.
      if (!claim) {
        throw new IdentityError("SESSION_NOT_FOUND", "the claim does not exist");
      }
      if (claim.userId === input.actorUserId) {
        throw new IdentityError("FORBIDDEN", "a reviewer cannot decide their own claim");
      }

      const now = new Date();
      if (decision === "verify") {
        // Forced by `affiliations_one_verified_unique`: the earlier verified row
        // must go before this one can claim the state.
        await tx
          .update(affiliations)
          .set({ status: "REVOKED", revokedAt: now, updatedAt: now })
          .where(and(eq(affiliations.userId, claim.userId), eq(affiliations.status, "VERIFIED")));
      }

      const [updated] = await tx
        .update(affiliations)
        .set(
          decision === "verify"
            ? {
                status: "VERIFIED",
                level: "LEVEL_1" as AffiliationLevel,
                method: "ADMIN_ATTESTATION" as const,
                decidedByUserId: input.actorUserId,
                decisionReason: reason,
                verifiedAt: now,
                updatedAt: now,
              }
            : {
                status: "REJECTED",
                decidedByUserId: input.actorUserId,
                decisionReason: reason,
                updatedAt: now,
              },
        )
        .where(and(eq(affiliations.id, claim.id), eq(affiliations.status, "PENDING")))
        .returning({
          id: affiliations.id,
          status: affiliations.status,
          level: affiliations.level,
          method: affiliations.method,
          verifiedAt: affiliations.verifiedAt,
        });

      // Conditional, not check-then-write (D-102): a zero-row match rolls the
      // whole transaction back, so no revoke, no audit row and no email remain.
      if (!updated) {
        throw new IdentityError("CLAIM_ALREADY_DECIDED", "this claim has already been decided");
      }

      await appendAuditEntry(tx, {
        action: decision === "verify" ? "AFFILIATION_GRANTED" : "AFFILIATION_REJECTED",
        actorUserId: input.actorUserId,
        actorRole: "INSTITUTION_ADMIN",
        objectType: "AFFILIATION",
        objectId: claim.id,
        requestId: input.requestId,
        reason,
        metadata: { level: updated.level, method: updated.method, status: updated.status },
      });

      await enqueueOutboxEvent(tx, {
        aggregateType: "AFFILIATION",
        aggregateId: claim.id,
        eventType: "EmailRequested",
        dedupeKey: `email:affiliation-decided:${claim.id}`,
        payload: {
          to: claim.email,
          template: "affiliation-decided",
          subject:
            decision === "verify"
              ? "Your connect affiliation is verified"
              : "Your connect affiliation claim was not approved",
          // The institution and the decision only: never who decided.
          text: [
            decision === "verify"
              ? `Your affiliation at ${claim.institutionName} was verified.`
              : `Your affiliation claim at ${claim.institutionName} was not approved.`,
            "",
            decision === "verify"
              ? "Level 1 is now recorded on your account."
              : "You can claim again with corrected details, or contact the institution.",
          ].join("\n"),
        },
      });

      if (decision === "verify") {
        await syncMentorActivation(tx, claim.userId);
        // A no-op here by construction — the replacement row is already VERIFIED —
        // but evaluated rather than assumed, so the guard has one meaning at both
        // revocation sites (D-165).
        await expireRequestsWithoutVerifiedAffiliation(tx, {
          mentorUserId: claim.userId,
          requestId: input.requestId,
        });
      }

      return {
        id: updated.id,
        status: updated.status as DecidedClaimRecord["status"],
        level: updated.level as AffiliationLevel,
        method: updated.method as DecidedClaimRecord["method"],
        verifiedAt: updated.verifiedAt,
      };
    });
  }

  async resolveGrantTarget(input: { institutionId: string; email: string }): Promise<string> {
    const [institution] = await this.db
      .select({ id: institutions.id })
      .from(institutions)
      .where(eq(institutions.id, input.institutionId))
      .limit(1);
    if (!institution) {
      throw new IdentityError("SESSION_NOT_FOUND", "the institution does not exist");
    }

    const email = input.email.trim().toLowerCase();
    const [account] = await this.db
      .select({ id: users.id })
      .from(users)
      .where(sql`lower(${users.email}) = ${email}`)
      .limit(1);
    if (!account) {
      throw new IdentityError("VALIDATION_ERROR", "email must belong to an existing account");
    }
    return account.id;
  }
}
