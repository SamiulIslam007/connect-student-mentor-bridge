import { and, eq } from "drizzle-orm";

import type { Database } from "../db/database.js";
import { affiliations, mentorProfiles, mentorshipRequests, studentProfiles, users } from "../db/schema/index.js";
import { appOrigin } from "../email/app-origin.js";
import { enqueueOutboxEvent } from "../platform/outbox/outbox.js";

/** Anything that can read and write inside the caller's transaction. */
type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

/**
 * A mentor who holds no `VERIFIED` affiliation cannot accept anything, so every
 * request still `PENDING` with them expires in the same transaction as the change
 * that cost them Level 1 (design R1, D-165).
 *
 * Evaluated on the state *after* the caller's writes, not on "a revocation
 * happened": the attestation path revokes one row and verifies another in the
 * same transaction and must expire nothing. Idempotent by construction — the
 * update is conditional on `PENDING`, so a retry finds no rows, and the outbox
 * dedupe key blocks a second notice.
 */
export async function expireRequestsWithoutVerifiedAffiliation(
  tx: Tx,
  input: { mentorUserId: string; requestId: string },
): Promise<{ expired: string[] }> {
  const verified = await tx
    .select({ id: affiliations.id })
    .from(affiliations)
    .where(and(eq(affiliations.userId, input.mentorUserId), eq(affiliations.status, "VERIFIED")))
    .limit(1);
  if (verified.length > 0) {
    return { expired: [] };
  }

  const [profile] = await tx
    .select({ id: mentorProfiles.id })
    .from(mentorProfiles)
    .where(eq(mentorProfiles.userId, input.mentorUserId))
    .limit(1);
  if (!profile) {
    return { expired: [] };
  }

  const expired = await tx
    .update(mentorshipRequests)
    .set({ status: "EXPIRED", expiryReason: "MENTOR_INELIGIBLE", updatedAt: new Date() })
    .where(
      and(
        eq(mentorshipRequests.mentorProfileId, profile.id),
        eq(mentorshipRequests.status, "PENDING"),
      ),
    )
    .returning({ id: mentorshipRequests.id });

  for (const row of expired) {
    const [recipient] = await tx
      .select({ to: users.email })
      .from(mentorshipRequests)
      .innerJoin(studentProfiles, eq(studentProfiles.id, mentorshipRequests.studentProfileId))
      .innerJoin(users, eq(users.id, studentProfiles.userId))
      .where(eq(mentorshipRequests.id, row.id))
      .limit(1);
    if (!recipient) {
      continue;
    }
    // The same template with reason-specific text: the fact is still "expired",
    // and a second template would add a union member for no user-visible gain
    // (D-167). The text names neither the institution nor the mentor.
    await enqueueOutboxEvent(tx, {
      aggregateType: "MENTORSHIP_REQUEST",
      aggregateId: row.id,
      eventType: "EmailRequested",
      dedupeKey: `email:request-expired-ineligible:${row.id}`,
      payload: {
        to: recipient.to,
        template: "request-expired",
        subject: "Your mentorship request expired",
        text: [
          "Your mentorship request expired because your mentor's affiliation could not be re-verified.",
          "",
          `You can ask someone else: ${appOrigin()}/mentors`,
        ].join("\n"),
      },
    });
  }

  return { expired: expired.map((row) => row.id) };
}
