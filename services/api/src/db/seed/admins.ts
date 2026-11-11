import { randomBytes, randomUUID } from "node:crypto";

import { hashPassword } from "better-auth/crypto";
import { eq } from "drizzle-orm";

import type { Database } from "../database.js";
import { accounts, institutions, roleAssignments, users } from "../schema/index.js";

/**
 * The two privileged demo accounts (D-97, D-103). The reserved `example.com`
 * domain is unusable in the real world, the passwords are generated per run and
 * printed once, and nothing here runs when `NODE_ENV=production` — the pilot's
 * platform admin still comes from the hand-run `INSERT` in `docs/local-setup.md`.
 */
export const ADMIN_SEED = [
  {
    email: "platform.admin@example.com",
    name: "Platform Admin (demo)",
    role: "PLATFORM_ADMIN",
    institution: null,
  },
  {
    email: "institution.admin@example.com",
    name: "Institution Admin (demo)",
    role: "INSTITUTION_ADMIN",
    institution: "Illustrative University",
  },
] as const;

/** Why the admin seed may not run, or null when it may. */
export function adminSeedRefusal(env: NodeJS.ProcessEnv): string | null {
  if (env.NODE_ENV === "production") {
    return "the admin seed never runs in production";
  }
  return null;
}

export interface SeededAdmin {
  email: string;
  role: string;
  /** Printed once by the seed entry point; never written to a file or a log. */
  password: string;
}

export interface AdminSeedResult {
  created: SeededAdmin[];
  skipped: string[];
}

/** Idempotent by email: a second run creates nothing and prints no password. */
export async function seedAdmins(db: Database): Promise<AdminSeedResult> {
  const created: SeededAdmin[] = [];
  const skipped: string[] = [];

  await db.transaction(async (tx) => {
    for (const admin of ADMIN_SEED) {
      const [existing] = await tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, admin.email))
        .limit(1);
      if (existing) {
        skipped.push(admin.email);
        continue;
      }

      let institutionId: string | null = null;
      if (admin.institution) {
        const [institution] = await tx
          .select({ id: institutions.id })
          .from(institutions)
          .where(eq(institutions.name, admin.institution))
          .limit(1);
        if (!institution) {
          throw new Error(
            `the admin seed needs the institution "${admin.institution}"; run the institution seed first`,
          );
        }
        institutionId = institution.id;
      }

      const userId = randomUUID();
      const password = randomBytes(18).toString("base64url");

      await tx.insert(users).values({
        id: userId,
        name: admin.name,
        email: admin.email,
        emailVerified: true,
        status: "ACTIVE",
        age18Plus: true,
        ageGatePassedAt: new Date(),
        ageGateVersion: "admin-seed",
      });
      // The credential row the password sign-in reads; hashed by the library's
      // own function so the stored format matches every other account.
      await tx.insert(accounts).values({
        id: randomUUID(),
        accountId: userId,
        providerId: "credential",
        userId,
        password: await hashPassword(password),
      });
      await tx
        .insert(roleAssignments)
        .values({ userId, role: admin.role, institutionId })
        .onConflictDoNothing();

      created.push({ email: admin.email, role: admin.role, password });
    }
  });

  return { created, skipped };
}
