import { randomUUID } from "node:crypto";

import { and, eq, isNull } from "drizzle-orm";

import { CONSENT_DOCUMENT_VERSION } from "@connect/config";

import { hashAccountPassword } from "../../identity/password-hash.js";
import { encryptTotpSecret } from "../../identity/totp-secret.js";
import type { Database } from "../database.js";
import { DEMO_MENTOR_PASSWORD, DEMO_TOTP_SECRET } from "./demo-constants.js";
import {
  accounts,
  affiliations,
  consentRecords,
  fields,
  institutions,
  institutionDomains,
  mentorProfiles,
  roleAssignments,
  twoFactors,
  users,
} from "../schema/index.js";

export { DEMO_TOTP_SECRET };

interface DemoMentor {
  email: string;
  name: string;
  headline: string;
  bio: string;
  expertiseSummary: string;
  scopeStatement: string;
  field: string;
  languages: string[];
  weeklyCapacity: number;
}

const DEMO_MENTORS: DemoMentor[] = [
  {
    email: "ayesha.rahman@example.edu.bd",
    name: "Ayesha Rahman",
    headline: "Product designer, fintech",
    bio: "Demo profile: ten years designing payment products in Dhaka.",
    expertiseSummary: "Product discovery, design systems, portfolio review",
    scopeStatement: "I can review your portfolio and help you plan a design career.",
    field: "Product design",
    languages: ["en", "bn"],
    weeklyCapacity: 2,
  },
  {
    email: "tanvir.hossain@example.edu.bd",
    name: "Tanvir Hossain",
    headline: "Backend engineer, distributed systems",
    bio: "Demo profile: backend engineer working on high-volume APIs.",
    expertiseSummary: "API design, databases, interview preparation",
    scopeStatement: "I can review designs and help you prepare for backend interviews.",
    field: "Software engineering",
    languages: ["en"],
    weeklyCapacity: 2,
  },
];

/** Why the demo seed may not run, or null when it may. */
export function demoSeedRefusal(env: NodeJS.ProcessEnv): string | null {
  if (env.NODE_ENV === "production") {
    return "the demo mentor seed never runs in production";
  }
  if (env.SEED_DEMO_MENTORS !== "1") {
    return "set SEED_DEMO_MENTORS=1 to run the demo mentor seed";
  }
  return null;
}

async function demoInstitutionId(tx: Parameters<Parameters<Database["transaction"]>[0]>[0]): Promise<string> {
  const [existing] = await tx
    .select({ id: institutions.id })
    .from(institutions)
    .where(eq(institutions.name, "Example Institute (demo)"))
    .limit(1);
  if (existing) {
    return existing.id;
  }
  const [created] = await tx
    .insert(institutions)
    .values({
      name: "Example Institute (demo)",
      kind: "UNIVERSITY",
      countryCode: "BD",
      status: "ACTIVE",
    })
    .returning({ id: institutions.id });
  if (!created) {
    throw new Error("the demo institution insert returned no row");
  }
  await tx
    .insert(institutionDomains)
    .values({ institutionId: created.id, domain: "example.edu.bd", verifiedAt: new Date() })
    .onConflictDoNothing();
  return created.id;
}

async function demoFieldId(
  tx: Parameters<Parameters<Database["transaction"]>[0]>[0],
  name: string,
): Promise<string> {
  const slug = name.trim().toLowerCase();
  const [existing] = await tx
    .select({ id: fields.id })
    .from(fields)
    .where(eq(fields.normalizedSlug, slug))
    .limit(1);
  if (existing) {
    return existing.id;
  }
  const [created] = await tx
    .insert(fields)
    .values({ name, normalizedSlug: slug })
    .returning({ id: fields.id });
  if (!created) {
    throw new Error("the demo field insert returned no row");
  }
  return created.id;
}

/** Idempotent: writes the two agreements and the orientation only where absent. */
async function grantDemoAgreements(
  tx: Parameters<Parameters<Database["transaction"]>[0]>[0],
  userId: string,
): Promise<void> {
  const [granted] = await tx
    .select({ id: consentRecords.id })
    .from(consentRecords)
    .where(and(eq(consentRecords.userId, userId), eq(consentRecords.purpose, "VOLUNTEER_AGREEMENT")))
    .limit(1);
  if (!granted) {
    await tx.insert(consentRecords).values([
      { userId, purpose: "VOLUNTEER_AGREEMENT", action: "GRANTED", documentVersion: CONSENT_DOCUMENT_VERSION },
      { userId, purpose: "COMMUNITY_GUIDELINES", action: "GRANTED", documentVersion: CONSENT_DOCUMENT_VERSION },
    ]);
  }
  await tx
    .update(mentorProfiles)
    .set({ orientationCompletedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(mentorProfiles.userId, userId), isNull(mentorProfiles.orientationCompletedAt)));
}


/**
 * A demo mentor seeded before this change has no credential row and stores its
 * factor as plaintext, which the library cannot decrypt. Both are rewritten in
 * place so a rerun leaves a mentor that can actually sign in.
 */
async function repairDemoCredentials(
  tx: Parameters<Parameters<Database["transaction"]>[0]>[0],
  userId: string,
): Promise<void> {
  const [credential] = await tx
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.userId, userId), eq(accounts.providerId, "credential")))
    .limit(1);
  if (!credential) {
    await tx.insert(accounts).values({
      id: randomUUID(),
      accountId: userId,
      providerId: "credential",
      userId,
      password: await hashAccountPassword(DEMO_MENTOR_PASSWORD),
    });
  }
  await tx.update(users).set({ twoFactorEnabled: true }).where(eq(users.id, userId));
  const [factor] = await tx
    .select({ id: twoFactors.id })
    .from(twoFactors)
    .where(eq(twoFactors.userId, userId))
    .limit(1);
  if (!factor) {
    await tx.insert(twoFactors).values({
      id: randomUUID(),
      secret: await encryptTotpSecret(DEMO_TOTP_SECRET, process.env.BETTER_AUTH_SECRET ?? ""),
      backupCodes: "[]",
      userId,
      verified: true,
    });
  }
}

/** Idempotent by email: a second run inserts nothing. */
export async function seedDemoMentors(
  db: Database,
): Promise<{ inserted: string[]; skipped: string[] }> {
  const inserted: string[] = [];
  const skipped: string[] = [];

  await db.transaction(async (tx) => {
    const institutionId = await demoInstitutionId(tx);

    for (const mentor of DEMO_MENTORS) {
      const [existing] = await tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, mentor.email))
        .limit(1);
      if (existing) {
        // A demo mentor seeded before the agreements existed still has to hold
        // them, or its next re-evaluation drops it to PENDING (D-127). Demo data
        // only: no migration writes a consent row for a real account (D-130).
        await grantDemoAgreements(tx, existing.id);
        await repairDemoCredentials(tx, existing.id);
        skipped.push(mentor.email);
        continue;
      }

      const userId = randomUUID();
      await tx.insert(users).values({
        id: userId,
        name: mentor.name,
        email: mentor.email,
        emailVerified: true,
        status: "ACTIVE",
        // Without this flag the library never challenges the factor, so the seeded
        // row below would be decoration (the sign-in would answer no MFA).
        twoFactorEnabled: true,
        age18Plus: true,
        ageGatePassedAt: new Date(),
        ageGateVersion: "demo-seed",
      });
      await tx.insert(roleAssignments).values({ userId, role: "MENTOR" });
      await tx.insert(affiliations).values({
        userId,
        institutionId,
        kind: "FACULTY_STAFF",
        level: "LEVEL_1",
        method: "ADMIN_ATTESTATION",
        status: "VERIFIED",
        verifiedAt: new Date(),
      });
      // The seeded mentor signs in like a person does: a credential row and an
      // encrypted factor, so the browser path can reach the accept step (D-236).
      await tx.insert(accounts).values({
        id: randomUUID(),
        accountId: userId,
        providerId: "credential",
        userId,
        password: await hashAccountPassword(DEMO_MENTOR_PASSWORD),
      });
      await tx.insert(twoFactors).values({
        id: randomUUID(),
        secret: await encryptTotpSecret(DEMO_TOTP_SECRET, process.env.BETTER_AUTH_SECRET ?? ""),
        backupCodes: "[]",
        userId,
        verified: true,
      });
      await tx.insert(mentorProfiles).values({
        userId,
        primaryFieldId: await demoFieldId(tx, mentor.field),
        status: "ACTIVE",
        onboardingStatus: "AFFILIATION_VERIFIED",
        activatedAt: new Date(),
        // The agreements and the orientation are the activation inputs (D-127),
        // so the demo mentor holds them and a later re-evaluation keeps it ACTIVE.
        orientationCompletedAt: new Date(),
        headline: mentor.headline,
        bio: mentor.bio,
        expertiseSummary: mentor.expertiseSummary,
        scopeStatement: mentor.scopeStatement,
        languages: mentor.languages,
        weeklyCapacity: mentor.weeklyCapacity,
      });
      await tx.insert(consentRecords).values([
        {
          userId,
          purpose: "VOLUNTEER_AGREEMENT",
          action: "GRANTED",
          documentVersion: CONSENT_DOCUMENT_VERSION,
        },
        {
          userId,
          purpose: "COMMUNITY_GUIDELINES",
          action: "GRANTED",
          documentVersion: CONSENT_DOCUMENT_VERSION,
        },
      ]);
      inserted.push(mentor.email);
    }
  });

  return { inserted, skipped };
}
