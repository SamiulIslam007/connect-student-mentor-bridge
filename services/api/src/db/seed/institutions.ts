import { and, count, eq } from "drizzle-orm";

import type { Database } from "../database.js";
import { institutionDomains, institutions, institutionKind } from "../schema/index.js";

type InstitutionKind = (typeof institutionKind.enumValues)[number];

export interface InstitutionSeed {
  name: string;
  kind: InstitutionKind;
  countryCode: string;
  domains: string[];
}

/**
 * Illustrative rows only (the pilot partner is an open decision). The names and
 * `.example` domains are reserved for documentation and are not real
 * institutions. Replace them when the partner is known; never invent a real
 * institution here without one.
 */
export const INSTITUTION_SEED: readonly InstitutionSeed[] = [
  {
    name: "Illustrative University",
    kind: "UNIVERSITY",
    countryCode: "BD",
    // `example.edu.bd` is a documentation placeholder (D-57), not a partnership.
    domains: ["illustrative-university.example", "example.edu.bd"],
  },
  {
    name: "Illustrative Training Institute",
    kind: "TRAINING_INSTITUTE",
    countryCode: "BD",
    domains: ["illustrative-training.example"],
  },
];

export interface SeedResult {
  institutions: number;
  domains: number;
  inserted: { institutions: number; domains: number };
}

function assertNoDuplicateDomains(seed: readonly InstitutionSeed[]): void {
  const owners = new Map<string, string>();
  for (const entry of seed) {
    for (const domain of entry.domains) {
      const key = domain.trim().toLowerCase();
      const owner = owners.get(key);
      if (owner) {
        throw new Error(`duplicate institution domain in the seed source: ${domain} (${owner} and ${entry.name})`);
      }
      owners.set(key, entry.name);
    }
  }
}

/**
 * Idempotent: institutions are matched by name and country, domains by their
 * case-insensitive value. Any conflict aborts the whole transaction, so a
 * failed run leaves no partial rows.
 */
export async function seedInstitutions(
  database: Database,
  seed: readonly InstitutionSeed[] = INSTITUTION_SEED,
): Promise<SeedResult> {
  assertNoDuplicateDomains(seed);

  return database.transaction(async (tx) => {
    let insertedInstitutions = 0;
    let insertedDomains = 0;

    for (const entry of seed) {
      const existing = await tx
        .select({ id: institutions.id })
        .from(institutions)
        .where(and(eq(institutions.name, entry.name), eq(institutions.countryCode, entry.countryCode)))
        .limit(1);

      let institutionId = existing[0]?.id;
      if (!institutionId) {
        const inserted = await tx
          .insert(institutions)
          .values({
            name: entry.name,
            kind: entry.kind,
            countryCode: entry.countryCode.toUpperCase(),
          })
          .returning({ id: institutions.id });
        institutionId = inserted[0].id;
        insertedInstitutions += 1;
      }

      for (const domain of entry.domains) {
        const normalized = domain.trim().toLowerCase();
        const known = await tx
          .select({ id: institutionDomains.id, institutionId: institutionDomains.institutionId })
          .from(institutionDomains)
          .where(eq(institutionDomains.domain, normalized))
          .limit(1);
        if (known.length > 0) {
          if (known[0].institutionId !== institutionId) {
            throw new Error(
              `institution domain is already registered to another institution: ${normalized}`,
            );
          }
          continue;
        }

        try {
          await tx.insert(institutionDomains).values({ institutionId, domain: normalized });
          insertedDomains += 1;
        } catch (error) {
          // Only a unique violation means the domain is taken; anything else is
          // a real fault and must not be relabelled.
          if ((error as { code?: string }).code !== "23505") {
            throw error;
          }
          throw new Error(`institution domain is already registered: ${normalized}`, {
            cause: error,
          });
        }
      }
    }

    const [institutionTotal] = await tx.select({ value: count() }).from(institutions);
    const [domainTotal] = await tx.select({ value: count() }).from(institutionDomains);

    return {
      institutions: Number(institutionTotal.value),
      domains: Number(domainTotal.value),
      inserted: { institutions: insertedInstitutions, domains: insertedDomains },
    };
  });
}
