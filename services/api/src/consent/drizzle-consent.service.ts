import { and, desc, eq } from "drizzle-orm";

import { CONSENT_DOCUMENT_VERSION } from "@connect/config";
import { IdentityError } from "@connect/domain";

import type { Database } from "../db/database.js";
import {
  affiliations,
  consentRecords,
  institutions,
  mentorProfiles,
} from "../db/schema/index.js";
import { appendAuditEntry } from "../identity/audit-log.js";
import { syncMentorActivation } from "../onboarding/mentor-activation.js";
import {
  CONSENT_PURPOSES,
  CONSENT_VERSION_MAX_LENGTH,
  SHARING_PURPOSE,
  isConsentAction,
  isConsentPurpose,
  type ConsentService,
  type ConsentState,
  type ConsentInstitution,
  type ConsentsView,
  type RecordConsentInput,
  type RecordedConsent,
} from "./consent.service.js";

/**
 * The signed-in consent surface (design R1). One route pair serves all five
 * purposes; the row is append-only, so a grant and a later withdrawal are two
 * rows and the latest one is the state.
 */
export class DrizzleConsentService implements ConsentService {
  constructor(private readonly database: Database) {}

  async read(userId: string): Promise<ConsentsView> {
    const rows = await this.database
      .select({
        purpose: consentRecords.purpose,
        action: consentRecords.action,
        documentVersion: consentRecords.documentVersion,
        institutionId: consentRecords.institutionId,
        occurredAt: consentRecords.occurredAt,
      })
      .from(consentRecords)
      .where(eq(consentRecords.userId, userId))
      .orderBy(desc(consentRecords.occurredAt));

    const latest = new Map<string, (typeof rows)[number]>();
    for (const row of rows) {
      if (!latest.has(row.purpose)) {
        latest.set(row.purpose, row);
      }
    }

    const purposes: ConsentState[] = CONSENT_PURPOSES.map((purpose) => {
      const row = latest.get(purpose);
      return {
        purpose,
        current_version: CONSENT_DOCUMENT_VERSION,
        accepted_version: row?.action === "GRANTED" ? row.documentVersion : null,
        action: row?.action ?? null,
        institution_id: row?.institutionId ?? null,
      };
    });

    return { purposes, institutions: await this.institutionsFor(userId) };
  }

  async record(input: RecordConsentInput): Promise<RecordedConsent> {
    const purpose = this.purposeField(input.purpose);
    const action = this.actionField(input.action);
    const documentVersion = this.versionField(input.documentVersion);
    const institutionId = await this.institutionField(purpose, input.institutionId, input.userId);

    return this.database.transaction(async (tx) => {
      const [record] = await tx
        .insert(consentRecords)
        .values({
          userId: input.userId,
          purpose,
          action,
          documentVersion,
          institutionId,
        })
        .returning({ id: consentRecords.id });

      await appendAuditEntry(tx, {
        action: action === "GRANTED" ? "CONSENT_GRANTED" : "CONSENT_WITHDRAWN",
        actorUserId: input.userId,
        objectType: "CONSENT_RECORD",
        objectId: record.id,
        requestId: input.requestId,
        metadata: { purpose, document_version: documentVersion, institution_id: institutionId },
      });

      const orientationCompletedAt = await this.stampOrientation(tx, {
        userId: input.userId,
        purpose,
        action,
        requestId: input.requestId,
      });

      // A mentor purpose changes the activation inputs, so the one funnel runs
      // here too; without it an accepted agreement would wait for an unrelated
      // trigger before it could activate the profile (apply decision R9).
      if (purpose !== SHARING_PURPOSE && purpose !== "TERMS" && purpose !== "PRIVACY_NOTICE") {
        await syncMentorActivation(tx, input.userId);
      }

      return {
        purpose,
        action,
        document_version: documentVersion,
        institution_id: institutionId,
        orientation_completed_at: orientationCompletedAt?.toISOString() ?? null,
      };
    });
  }

  /** One row per institution, so a withdrawal names the institution it withdraws from. */
  private async institutionsFor(userId: string): Promise<ConsentInstitution[]> {
    const rows = await this.database
      .selectDistinct({ id: institutions.id, name: institutions.name })
      .from(affiliations)
      .innerJoin(institutions, eq(institutions.id, affiliations.institutionId))
      .where(eq(affiliations.userId, userId));
    return rows;
  }

  private purposeField(value: string): (typeof CONSENT_PURPOSES)[number] {
    if (typeof value !== "string" || !isConsentPurpose(value)) {
      throw new IdentityError("VALIDATION_ERROR", "purpose is not a known consent purpose");
    }
    return value;
  }

  private actionField(value: unknown): "GRANTED" | "WITHDRAWN" {
    if (!isConsentAction(value)) {
      throw new IdentityError("VALIDATION_ERROR", "action must be GRANTED or WITHDRAWN");
    }
    return value;
  }

  private versionField(value: unknown): string {
    if (typeof value !== "string" || value.trim().length === 0) {
      throw new IdentityError("VALIDATION_ERROR", "document_version is required");
    }
    if (value.length > CONSENT_VERSION_MAX_LENGTH) {
      throw new IdentityError(
        "VALIDATION_ERROR",
        `document_version must be at most ${CONSENT_VERSION_MAX_LENGTH} characters`,
      );
    }
    return value;
  }

  /**
   * A sharing consent names an institution the caller is affiliated with; every
   * other purpose carries none. An institution they do not belong to is a `404`,
   * so an id from another account's affiliation tells the caller nothing.
   */
  private async institutionField(
    purpose: string,
    value: unknown,
    userId: string,
  ): Promise<string | null> {
    if (purpose !== SHARING_PURPOSE) {
      if (value !== undefined && value !== null) {
        throw new IdentityError(
          "VALIDATION_ERROR",
          "institution_id is only accepted for INSTITUTION_DATA_SHARING",
        );
      }
      return null;
    }
    if (typeof value !== "string" || value.trim().length === 0) {
      throw new IdentityError(
        "VALIDATION_ERROR",
        "institution_id is required for INSTITUTION_DATA_SHARING",
      );
    }
    const [membership] = await this.database
      .select({ institutionId: affiliations.institutionId })
      .from(affiliations)
      .where(and(eq(affiliations.userId, userId), eq(affiliations.institutionId, value)))
      .limit(1);
    if (!membership) {
      throw new IdentityError("SESSION_NOT_FOUND", "no such institution for this account");
    }
    return membership.institutionId;
  }

  /**
   * The orientation is acknowledged once, by accepting the volunteer agreement,
   * and it is neither a consent purpose nor withdrawable (design R2).
   */
  private async stampOrientation(
    tx: Pick<Database, "select" | "update" | "insert">,
    input: {
      userId: string;
      purpose: string;
      action: "GRANTED" | "WITHDRAWN";
      requestId: string;
    },
  ): Promise<Date | null> {
    if (input.purpose !== "VOLUNTEER_AGREEMENT" || input.action !== "GRANTED") {
      return null;
    }
    const [profile] = await tx
      .select({ completedAt: mentorProfiles.orientationCompletedAt })
      .from(mentorProfiles)
      .where(eq(mentorProfiles.userId, input.userId))
      .limit(1);
    if (!profile) {
      return null;
    }
    if (profile.completedAt) {
      return profile.completedAt;
    }
    const now = new Date();
    await tx
      .update(mentorProfiles)
      .set({ orientationCompletedAt: now, updatedAt: now })
      .where(eq(mentorProfiles.userId, input.userId));
    await appendAuditEntry(tx, {
      action: "ORIENTATION_COMPLETED",
      actorUserId: input.userId,
      objectType: "MENTOR_PROFILE",
      objectId: input.userId,
      requestId: input.requestId,
    });
    return now;
  }
}
