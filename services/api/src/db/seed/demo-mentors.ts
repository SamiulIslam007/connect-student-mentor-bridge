import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";

import type { Database } from "../database.js";
import {
  affiliations,
  fields,
  institutions,
  institutionDomains,
  mentorProfiles,
  roleAssignments,
  twoFactors,
  users,
} from "../schema/index.js";

/** A fixed, obviously fake secret; the seed cannot run where it would matter. */
const DEMO_TOTP_SECRET = "DEMO-SEED-NOT-A-REAL-TOTP-SECRET";

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
      await tx.insert(twoFactors).values({
        id: randomUUID(),
        secret: DEMO_TOTP_SECRET,
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
        headline: mentor.headline,
        bio: mentor.bio,
        expertiseSummary: mentor.expertiseSummary,
        scopeStatement: mentor.scopeStatement,
        languages: mentor.languages,
        weeklyCapacity: mentor.weeklyCapacity,
      });
      inserted.push(mentor.email);
    }
  });

  return { inserted, skipped };
}
