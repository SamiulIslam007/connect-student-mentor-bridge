import { eq } from "drizzle-orm";

import type { Database } from "../../db/database.js";
import { outboxEvents } from "../../db/schema/index.js";

/** One queue name in the MVP (design D2/D4). */
export const OUTBOX_QUEUE = "outbox";

/** Exponential backoff for a retried event, in seconds (design D4). */
export const OUTBOX_RETRY_DELAY_SECONDS = 30;

/**
 * How long a relayed row stays out of the poll while its job is in flight. It is
 * a lease, not a schedule: a worker that dies before handling the job leaves the
 * row to be picked up again when the lease expires.
 */
export const OUTBOX_LEASE_SECONDS = 60;

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

/** Code constants with an environment override, read at call time. */
export function outboxPollIntervalMs(environment: NodeJS.ProcessEnv = process.env): number {
  return positiveInteger(environment.OUTBOX_POLL_INTERVAL_MS, 5_000);
}

export function outboxMaxAttempts(environment: NodeJS.ProcessEnv = process.env): number {
  return positiveInteger(environment.OUTBOX_MAX_ATTEMPTS, 5);
}

export interface OutboxEventInput {
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  payload: Record<string, unknown>;
  /** `<type>:<aggregate-id>:<detail>`; unique across the table. */
  dedupeKey: string;
  availableAt?: Date;
}

type OutboxWriter = Pick<Database, "insert" | "select">;

function required(value: string, field: string): string {
  if (!value || !value.trim()) {
    throw new Error(`an outbox event needs a non-empty ${field}`);
  }
  return value;
}

/**
 * The one write path for a side effect (design D1). It must be handed the same
 * transaction as the state change. A duplicate `dedupe_key` inserts nothing and
 * does not raise, so a retried request cannot enqueue a second side effect.
 */
export async function enqueueOutboxEvent(
  database: OutboxWriter,
  event: OutboxEventInput,
): Promise<boolean> {
  const inserted = await database
    .insert(outboxEvents)
    .values({
      aggregateType: required(event.aggregateType, "aggregate_type"),
      aggregateId: required(event.aggregateId, "aggregate_id"),
      eventType: required(event.eventType, "event_type"),
      payload: event.payload,
      dedupeKey: required(event.dedupeKey, "dedupe_key"),
      ...(event.availableAt ? { availableAt: event.availableAt } : {}),
    })
    .onConflictDoNothing({ target: outboxEvents.dedupeKey })
    .returning({ id: outboxEvents.id });
  return inserted.length > 0;
}

/** The row a script or a test reads back after `enqueueOutboxEvent`. */
export async function outboxEventId(
  database: Database,
  dedupeKey: string,
): Promise<string | null> {
  const [row] = await database
    .select({ id: outboxEvents.id })
    .from(outboxEvents)
    .where(eq(outboxEvents.dedupeKey, dedupeKey))
    .limit(1);
  return row?.id ?? null;
}
