import { createHash } from "node:crypto";

import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq, lt, sql } from "drizzle-orm";

import { IdentityError, validateConfigPayload, type ConfigPayload } from "@connect/domain";

import { DATABASE } from "../db/database.module.js";
import type { Database } from "../db/database.js";
import { configVersions } from "../db/schema/index.js";
import { appendAuditEntry } from "../identity/audit-log.js";
import type {
  ConfigService,
  ConfigVersionPage,
  ConfigVersionRecord,
  CreateConfigVersionInput,
  ListConfigVersionsInput,
} from "./config.service.js";

type Executor = Pick<Database, "select">;

const REASON_MAX_LENGTH = 1_000;

const versionColumns = {
  id: configVersions.id,
  version: configVersions.version,
  payload: configVersions.payload,
  digest: configVersions.digest,
  reason: configVersions.reason,
  createdByUserId: configVersions.createdByUserId,
  createdAt: configVersions.createdAt,
};

/**
 * `jsonb` does not preserve key order, so the payload is re-normalised on read:
 * the digest is defined over the canonical order, and a reader must be able to
 * recompute it from what the route returns (design R3).
 */
function recordOf(row: Record<string, unknown>): ConfigVersionRecord {
  const record = row as unknown as ConfigVersionRecord;
  const normalised = validateConfigPayload(record.payload);
  return normalised.ok ? { ...record, payload: normalised.payload } : record;
}

/** The digest is computed over the normalised payload, so a reader can recompute it. */
export function configDigest(payload: ConfigPayload): string {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

/**
 * The version in force, for the jobs (design R6). A free function so the
 * counting job and the sampler can call it without a Nest container; `null`
 * means the job must write nothing.
 */
export async function activeConfigVersion(
  executor: Executor,
): Promise<{ id: string; version: number; payload: ConfigPayload } | null> {
  const [row] = await executor
    .select({ id: configVersions.id, version: configVersions.version, payload: configVersions.payload })
    .from(configVersions)
    .orderBy(desc(configVersions.version))
    .limit(1);
  if (!row) {
    return null;
  }
  return { id: row.id, version: row.version, payload: row.payload as ConfigPayload };
}

@Injectable()
export class DrizzleConfigService implements ConfigService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async active(): Promise<ConfigVersionRecord | null> {
    const [row] = await this.db
      .select(versionColumns)
      .from(configVersions)
      .orderBy(desc(configVersions.version))
      .limit(1);
    return row ? recordOf(row) : null;
  }

  async list({ limit, cursor }: ListConfigVersionsInput): Promise<ConfigVersionPage> {
    const conditions = cursor === undefined ? [] : [lt(configVersions.version, cursor)];
    const rows = await this.db
      .select(versionColumns)
      .from(configVersions)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(configVersions.version))
      .limit(limit + 1);
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    return {
      versions: page.map(recordOf),
      nextCursor: hasMore ? (page[page.length - 1]?.version ?? null) : null,
    };
  }

  /**
   * One transaction: validate, hash, insert with `MAX(version) + 1` assigned by
   * the database, and append the audit row (design R3, R4).
   */
  async create(input: CreateConfigVersionInput): Promise<ConfigVersionRecord> {
    const reason = input.reason.trim();
    if (!reason) {
      throw new IdentityError("VALIDATION_ERROR", "reason is required");
    }
    if (reason.length > REASON_MAX_LENGTH) {
      throw new IdentityError(
        "VALIDATION_ERROR",
        `reason must be at most ${REASON_MAX_LENGTH} characters`,
      );
    }
    const validated = validateConfigPayload(input.payload);
    if (!validated.ok) {
      throw new IdentityError("VALIDATION_ERROR", validated.message);
    }
    const payload = validated.payload;
    const digest = configDigest(payload);

    return await this.db.transaction(async (tx) => {
      let inserted: { id: string } | undefined;
      try {
        const rows = await tx.execute(sql`
          INSERT INTO config_versions (version, payload, digest, reason, created_by_user_id)
          SELECT COALESCE(MAX(version), 0) + 1, ${JSON.stringify(payload)}::jsonb, ${digest}, ${reason}, ${input.actorUserId}
          FROM config_versions
          RETURNING id
        `);
        const first = (rows as unknown as { rows?: { id: string }[] }).rows?.[0];
        inserted = first;
      } catch (error) {
        if ((error as { code?: string }).code === "23505") {
          throw new IdentityError(
            "CONFIG_VERSION_CONFLICT",
            "another version was created at the same moment",
          );
        }
        throw error;
      }
      if (!inserted) {
        throw new Error("the config version insert returned no row");
      }
      await appendAuditEntry(tx, {
        action: "CONFIGURATION_CHANGED",
        actorUserId: input.actorUserId,
        actorRole: "PLATFORM_ADMIN",
        objectType: "config_versions",
        objectId: inserted.id,
        requestId: input.requestId,
        reason,
      });
      const [row] = await tx
        .select(versionColumns)
        .from(configVersions)
        .where(eq(configVersions.id, inserted.id))
        .limit(1);
      if (!row) {
        throw new Error("the created config version could not be read back");
      }
      return recordOf(row);
    });
  }
}
