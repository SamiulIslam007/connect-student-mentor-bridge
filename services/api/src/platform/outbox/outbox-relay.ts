import { and, asc, inArray, isNull, lte } from "drizzle-orm";

import type { Database } from "../../db/database.js";
import { outboxEvents } from "../../db/schema/index.js";
import { OUTBOX_LEASE_SECONDS } from "./outbox.js";

/** The relay's seam: the real adapter enqueues into pg-boss. */
export interface OutboxQueue {
  enqueue(eventId: string): Promise<void>;
}

/**
 * Claims due rows without blocking another poller, enqueues one job per row, and
 * leaves `processed_at` to the handler (design D2). A row enqueued twice is
 * coalesced by the queue's singleton key on the event id.
 */
export async function relayOutboxBatch(
  database: Database,
  queue: OutboxQueue,
  now: Date = new Date(),
  limit = 20,
): Promise<number> {
  return await database.transaction(async (tx) => {
    const rows = await tx
      .select({ id: outboxEvents.id })
      .from(outboxEvents)
      .where(
        and(
          isNull(outboxEvents.processedAt),
          isNull(outboxEvents.failedAt),
          lte(outboxEvents.availableAt, now),
        ),
      )
      .orderBy(asc(outboxEvents.availableAt), asc(outboxEvents.createdAt))
      .limit(limit)
      .for("update", { skipLocked: true });

    for (const row of rows) {
      await queue.enqueue(row.id);
    }
    if (rows.length > 0) {
      // The lease keeps the next poll from enqueuing a job that is still
      // in flight; the row itself schedules any retry (outbox-processor).
      await tx
        .update(outboxEvents)
        .set({
          availableAt: new Date(now.getTime() + OUTBOX_LEASE_SECONDS * 1000),
          updatedAt: now,
        })
        .where(
          inArray(
            outboxEvents.id,
            rows.map((row) => row.id),
          ),
        );
    }
    return rows.length;
  });
}
