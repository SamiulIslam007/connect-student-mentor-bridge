import { and, eq } from "drizzle-orm";

import type { AffiliationKind } from "@connect/domain";

import type { Database } from "../database.js";
import { affiliations, auditLogs, institutions, users } from "../schema/index.js";

export interface AffiliationAttestation {
  email: string;
  /** Institution name as it appears in the checked-in institution seed. */
  institution: string;
  kind: AffiliationKind;
  /** Why this account holds Level 1; stored as the decision reason. */
  reason: string;
}

/**
 * Pilot attestations (D-56). Checked-in source, not an admin surface: an entry
 * whose account does not exist is reported as skipped, never fatal. Replace
 * these placeholders when the pilot partner and its accounts are known.
 */
export const AFFILIATION_ATTESTATIONS: readonly AffiliationAttestation[] = [
  {
    email: "pilot.mentor@example.edu.bd",
    institution: "Illustrative University",
    kind: "ALUMNUS",
    reason: "Pilot partner attestation (documentation placeholder account)",
  },
  {
    email: "pilot.student@example.edu.bd",
    institution: "Illustrative University",
    kind: "STUDENT",
    reason: "Pilot partner attestation (documentation placeholder account)",
  },
];

export interface AttestationSeedResult {
  granted: number;
  skipped: { email: string; reason: string }[];
}

/**
 * Idempotent: an account that already holds a verified affiliation at the named
 * institution is skipped, so a rerun inserts nothing.
 */
export async function seedAffiliationAttestations(
  database: Database,
  seed: readonly AffiliationAttestation[] = AFFILIATION_ATTESTATIONS,
): Promise<AttestationSeedResult> {
  return database.transaction(async (tx) => {
    let granted = 0;
    const skipped: AttestationSeedResult["skipped"] = [];

    for (const entry of seed) {
      const [account] = await tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, entry.email.trim().toLowerCase()))
        .limit(1);
      if (!account) {
        skipped.push({ email: entry.email, reason: "no account" });
        continue;
      }

      const [institution] = await tx
        .select({ id: institutions.id })
        .from(institutions)
        .where(and(eq(institutions.name, entry.institution), eq(institutions.countryCode, "BD")))
        .limit(1);
      if (!institution) {
        skipped.push({ email: entry.email, reason: "no institution" });
        continue;
      }

      const [existing] = await tx
        .select({ id: affiliations.id })
        .from(affiliations)
        .where(
          and(
            eq(affiliations.userId, account.id),
            eq(affiliations.institutionId, institution.id),
            eq(affiliations.status, "VERIFIED"),
          ),
        )
        .limit(1);
      if (existing) {
        skipped.push({ email: entry.email, reason: "already attested" });
        continue;
      }

      const [inserted] = await tx
        .insert(affiliations)
        .values({
          userId: account.id,
          institutionId: institution.id,
          kind: entry.kind,
          level: "LEVEL_1",
          method: "ADMIN_ATTESTATION",
          status: "VERIFIED",
          decisionReason: entry.reason,
          verifiedAt: new Date(),
        })
        .returning({ id: affiliations.id });
      if (!inserted) {
        throw new Error("the attestation insert returned no row");
      }

      await tx.insert(auditLogs).values({
        action: "AFFILIATION_GRANTED",
        actorUserId: null,
        actorRole: "SYSTEM",
        objectType: "AFFILIATION",
        objectId: inserted.id,
        requestId: "seed-attestations",
        reason: entry.reason,
        metadata: { level: "LEVEL_1", method: "ADMIN_ATTESTATION" },
      });
      granted += 1;
    }

    return { granted, skipped };
  });
}
