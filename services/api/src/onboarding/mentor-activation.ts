import { and, eq } from "drizzle-orm";

import { mentorActivation, type AffiliationLevel, type MentorOperatingStatus } from "@connect/domain";

import type { Database } from "../db/database.js";
import { affiliations, mentorProfiles, users } from "../db/schema/index.js";

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

  const now = new Date();
  const next = mentorActivation({
    current: profile.status as MentorOperatingStatus,
    emailVerified: profile.emailVerified,
    mfaEnrolled: profile.mfaEnrolled === true,
    level: (verified?.level ?? null) as AffiliationLevel | null,
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
    .where(eq(mentorProfiles.userId, userId));
}
