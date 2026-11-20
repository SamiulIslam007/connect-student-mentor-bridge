import { and, eq, inArray, lt } from "drizzle-orm";

import { IDEMPOTENCY_IN_PROGRESS_MINUTES, IDEMPOTENCY_TTL_HOURS } from "@connect/config";

import type { Database } from "../../db/database.js";
import { idempotencyKeys } from "../../db/schema/index.js";

export interface StoredKey {
  id: string;
  status: string;
  requestDigest: string;
  responseStatus: number | null;
  responseBody: unknown;
}

export type BeginResult = { kind: "new"; id: string } | { kind: "existing"; row: StoredKey };

const UNIQUE_VIOLATION = "23505";
const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

/**
 * Inserts the intent row before the handler runs (design R5). A unique violation
 * means another call holds the key: the row is re-read and the caller decides
 * between replay and refusal, so a race never surfaces a raw database error.
 */
export async function beginKey(
  db: Database,
  input: { actorUserId: string; operation: string; key: string; digest: string; now?: Date },
): Promise<BeginResult> {
  const now = input.now ?? new Date();
  const expiresAt = new Date(now.getTime() + IDEMPOTENCY_IN_PROGRESS_MINUTES * MINUTE_MS);

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const [created] = await db
        .insert(idempotencyKeys)
        .values({
          actorUserId: input.actorUserId,
          operation: input.operation,
          key: input.key,
          requestDigest: input.digest,
          expiresAt,
        })
        .returning({ id: idempotencyKeys.id });
      return { kind: "new", id: (created as { id: string }).id };
    } catch (error) {
      // Drizzle wraps a driver error, so the SQLSTATE can sit on the cause.
      const code =
        (error as { code?: unknown }).code ??
        (error as { cause?: { code?: unknown } }).cause?.code;
      if (code !== UNIQUE_VIOLATION) {
        throw error;
      }
      const [row] = await db
        .select({
          id: idempotencyKeys.id,
          status: idempotencyKeys.status,
          requestDigest: idempotencyKeys.requestDigest,
          responseStatus: idempotencyKeys.responseStatus,
          responseBody: idempotencyKeys.responseBody,
        })
        .from(idempotencyKeys)
        .where(
          and(
            eq(idempotencyKeys.actorUserId, input.actorUserId),
            eq(idempotencyKeys.operation, input.operation),
            eq(idempotencyKeys.key, input.key),
          ),
        )
        .limit(1);
      if (row) {
        return { kind: "existing", row: row as StoredKey };
      }
      // The row was swept between the insert and the read: one more insert wins.
    }
  }
  throw new Error("the idempotency key could not be claimed");
}

/** Stores the response and extends the record to the completed retention. */
export async function completeKey(
  db: Database,
  input: { id: string; status: number; body: unknown; now?: Date },
): Promise<void> {
  const now = input.now ?? new Date();
  await db
    .update(idempotencyKeys)
    .set({
      status: "COMPLETED",
      responseStatus: input.status,
      responseBody: input.body,
      expiresAt: new Date(now.getTime() + IDEMPOTENCY_TTL_HOURS * HOUR_MS),
      updatedAt: now,
    })
    .where(eq(idempotencyKeys.id, input.id));
}

/** Deletes every record past its retention, at most `batch` per run. */
export async function sweepExpired(
  db: Database,
  input: { batch: number; now?: Date },
): Promise<number> {
  const now = input.now ?? new Date();
  const expired = db
    .select({ id: idempotencyKeys.id })
    .from(idempotencyKeys)
    .where(lt(idempotencyKeys.expiresAt, now))
    .limit(input.batch);
  const deleted = await db
    .delete(idempotencyKeys)
    .where(inArray(idempotencyKeys.id, expired))
    .returning({ id: idempotencyKeys.id });
  return deleted.length;
}
