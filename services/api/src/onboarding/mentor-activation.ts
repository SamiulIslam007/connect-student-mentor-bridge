import { and, desc, eq } from "drizzle-orm";

import { mentorActivation, type AffiliationLevel, type MentorOperatingStatus } from "@connect/domain";

import type { Database } from "../db/database.js";
import {
  affiliations,
  consentRecords,
  mentorProfiles,
  users,
} from "../db/schema/index.js";

type Executor = Pick<Database, "select" | "update">;

/**
 * The one place a mentor's operating status is recomputed (design D3). Called
 * from the affiliation claim, the second-factor enrol/disable path, and the
 * mentor-role grant. A suspended or removed profile keeps its status.
 */
export async function syncMentorActivation(database: Executor, userId: string): Promise<void> {
  const [profile] = await database
    .select({
      status: mentorProfiles.status,
      activatedAt: mentorProfiles.activatedAt,
      emailVerified: users.emailVerified,
      mfaEnrolled: users.twoFactorEnabled,
      orientationCompletedAt: mentorProfiles.orientationCompletedAt,
    })
    .from(mentorProfiles)
    .innerJoin(users, eq(users.id, mentorProfiles.userId))
    .where(eq(mentorProfiles.userId, userId))
    .limit(1);
  if (!profile) {
    return;
  }

  const [verified] = await database
    .select({ level: affiliations.level })
    .from(affiliations)
    .where(and(eq(affiliations.userId, userId), eq(affiliations.status, "VERIFIED")))
    .limit(1);

  // The two mentor documents are consent rows, so the latest row per purpose is
  // the state; a withdrawal is a later row and turns the input false (D-127).
  const consents = await database
    .select({
      purpose: consentRecords.purpose,
      action: consentRecords.action,
    })
    .from(consentRecords)
    .where(eq(consentRecords.userId, userId))
    .orderBy(desc(consentRecords.occurredAt));
  const latest = new Map<string, string>();
  for (const consent of consents) {
    if (!latest.has(consent.purpose)) {
      latest.set(consent.purpose, consent.action);
    }
  }

  const now = new Date();
  const next = mentorActivation({
    current: profile.status as MentorOperatingStatus,
    emailVerified: profile.emailVerified,
    mfaEnrolled: profile.mfaEnrolled === true,
    level: (verified?.level ?? null) as AffiliationLevel | null,
    hasVolunteerAgreement: latest.get("VOLUNTEER_AGREEMENT") === "GRANTED",
    hasCommunityGuidelines: latest.get("COMMUNITY_GUIDELINES") === "GRANTED",
    orientationCompleted: profile.orientationCompletedAt !== null,
    activatedAt: profile.activatedAt,
    now,
  });

  await database
    .update(mentorProfiles)
    .set({
      status: next.status,
      onboardingStatus: next.onboardingStatus,
      activatedAt: next.activatedAt,
      updatedAt: now,
    })
    // Conditional on the status read above: a suspension, removal, or any other
    // concurrent write wins, and the next trigger recomputes from the row (D-150).
    .where(and(eq(mentorProfiles.userId, userId), eq(mentorProfiles.status, profile.status)));
}
