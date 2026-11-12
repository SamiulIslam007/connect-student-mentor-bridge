import { Inject, Injectable } from "@nestjs/common";
import { asc, inArray } from "drizzle-orm";

import { IdentityError } from "@connect/domain";

import { DATABASE } from "../db/database.module.js";
import type { Database } from "../db/database.js";
import { institutionDomains, institutions } from "../db/schema/index.js";
import { appendAuditEntry } from "../identity/audit-log.js";
import {
  INSTITUTION_DOMAIN_MAX_ENTRIES,
  INSTITUTION_DOMAIN_MAX_LENGTH,
  INSTITUTION_DOMAIN_MIN_LENGTH,
  INSTITUTION_KINDS,
  INSTITUTION_NAME_MAX_LENGTH,
  type CreateInstitutionInput,
  type InstitutionKindValue,
  type InstitutionRecord,
  type InstitutionsService,
} from "./institutions.service.js";

const DOMAIN_PATTERN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function validatedName(value: unknown): string {
  const name = typeof value === "string" ? value.trim() : "";
  if (!name) {
    throw new IdentityError("VALIDATION_ERROR", "name is required");
  }
  if (name.length > INSTITUTION_NAME_MAX_LENGTH) {
    throw new IdentityError(
      "VALIDATION_ERROR",
      `name must be at most ${INSTITUTION_NAME_MAX_LENGTH} characters`,
    );
  }
  return name;
}

function validatedKind(value: unknown): InstitutionKindValue {
  if (typeof value === "string" && (INSTITUTION_KINDS as readonly string[]).includes(value)) {
    return value as InstitutionKindValue;
  }
  throw new IdentityError(
    "VALIDATION_ERROR",
    `kind must be one of ${INSTITUTION_KINDS.join(", ")}`,
  );
}

function validatedCountryCode(value: unknown): string {
  const code = typeof value === "string" ? value.trim() : "";
  if (!/^[A-Za-z]{2}$/.test(code)) {
    throw new IdentityError("VALIDATION_ERROR", "country_code must be two letters");
  }
  return code.toUpperCase();
}

/** Optional, ISO `YYYY-MM-DD`, and never in the future. */
function validatedMouDate(value: unknown): string | null {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  const text = typeof value === "string" ? value.trim() : "";
  if (!DATE_PATTERN.test(text) || Number.isNaN(Date.parse(`${text}T00:00:00Z`))) {
    throw new IdentityError("VALIDATION_ERROR", "mou_signed_on must be a date in the form YYYY-MM-DD");
  }
  if (text > new Date().toISOString().slice(0, 10)) {
    throw new IdentityError("VALIDATION_ERROR", "mou_signed_on must not be in the future");
  }
  return text;
}

/** Lower-cased bare domains: no scheme, no at-sign, at least one dot, bounded. */
function validatedDomains(value: unknown): string[] {
  if (value === undefined || value === null) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new IdentityError("VALIDATION_ERROR", "domains must be an array of strings");
  }
  if (value.length > INSTITUTION_DOMAIN_MAX_ENTRIES) {
    throw new IdentityError(
      "VALIDATION_ERROR",
      `domains must have at most ${INSTITUTION_DOMAIN_MAX_ENTRIES} entries`,
    );
  }
  const domains = value.map((entry) => (typeof entry === "string" ? entry.trim().toLowerCase() : ""));
  for (const domain of domains) {
    if (
      domain.length < INSTITUTION_DOMAIN_MIN_LENGTH ||
      domain.length > INSTITUTION_DOMAIN_MAX_LENGTH ||
      !DOMAIN_PATTERN.test(domain)
    ) {
      throw new IdentityError(
        "VALIDATION_ERROR",
        `domains must be bare domains such as example.edu, and ${JSON.stringify(domain)} is not one`,
      );
    }
  }
  return domains;
}

/** The unique index is the guard; a raw database error would be a 500. Drizzle
 * wraps the driver error, so the code and the constraint sit on its cause. */
function isDomainConflict(error: unknown): boolean {
  let candidate: unknown = error;
  for (let depth = 0; depth < 5 && candidate; depth += 1) {
    const entry = candidate as {
      code?: string;
      constraint?: string;
      message?: string;
      cause?: unknown;
    } | null;
    if (entry?.code === "23505" && (entry.constraint ?? "").includes("institution_domains_domain_unique")) {
      return true;
    }
    candidate = entry?.cause;
  }
  return false;
}

@Injectable()
export class DrizzleInstitutionsService implements InstitutionsService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async createInstitution(input: CreateInstitutionInput): Promise<InstitutionRecord> {
    const name = validatedName(input.name);
    const kind = validatedKind(input.kind);
    const countryCode = validatedCountryCode(input.countryCode);
    const mouSignedOn = validatedMouDate(input.mouSignedOn);
    const domains = validatedDomains(input.domains);

    try {
      return await this.db.transaction(async (tx) => {
        const [created] = await tx
          .insert(institutions)
          .values({ name, kind, countryCode, mouSignedOn })
          .returning({ id: institutions.id, status: institutions.status });

        if (domains.length > 0) {
          await tx
            .insert(institutionDomains)
            .values(domains.map((domain) => ({ institutionId: created.id, domain })));
        }

        await appendAuditEntry(tx, {
          action: "INSTITUTION_CREATED",
          actorUserId: input.actorUserId,
          actorRole: "PLATFORM_ADMIN",
          objectType: "INSTITUTION",
          objectId: created.id,
          requestId: input.requestId,
          metadata: { kind, country_code: countryCode },
        });

        for (const domain of domains) {
          await appendAuditEntry(tx, {
            action: "INSTITUTION_DOMAIN_REGISTERED",
            actorUserId: input.actorUserId,
            actorRole: "PLATFORM_ADMIN",
            objectType: "INSTITUTION",
            objectId: created.id,
            requestId: input.requestId,
            metadata: { domain },
          });
        }

        return {
          id: created.id,
          name,
          kind,
          countryCode,
          status: created.status,
          mouSignedOn,
          domains,
        };
      });
    } catch (error) {
      if (isDomainConflict(error)) {
        throw new IdentityError(
          "INSTITUTION_DOMAIN_TAKEN",
          "one of these domains already belongs to an institution",
        );
      }
      throw error;
    }
  }

  async listInstitutions(): Promise<InstitutionRecord[]> {
    const rows = await this.db
      .select({
        id: institutions.id,
        name: institutions.name,
        kind: institutions.kind,
        countryCode: institutions.countryCode,
        status: institutions.status,
        mouSignedOn: institutions.mouSignedOn,
      })
      .from(institutions)
      .orderBy(asc(institutions.name), asc(institutions.id));

    if (rows.length === 0) {
      return [];
    }

    const domainRows = await this.db
      .select({ institutionId: institutionDomains.institutionId, domain: institutionDomains.domain })
      .from(institutionDomains)
      .where(
        inArray(
          institutionDomains.institutionId,
          rows.map((row) => row.id),
        ),
      )
      .orderBy(asc(institutionDomains.domain));

    const byInstitution = new Map<string, string[]>();
    for (const domain of domainRows) {
      const collected = byInstitution.get(domain.institutionId) ?? [];
      collected.push(domain.domain);
      byInstitution.set(domain.institutionId, collected);
    }

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      kind: row.kind as InstitutionKindValue,
      countryCode: row.countryCode,
      status: row.status,
      mouSignedOn: row.mouSignedOn ?? null,
      domains: byInstitution.get(row.id) ?? [],
    }));
  }
}
