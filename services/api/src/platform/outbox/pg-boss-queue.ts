import type { PgBoss } from "pg-boss";

import { OUTBOX_QUEUE } from "./outbox.js";
import type { OutboxQueue } from "./outbox-relay.js";

/**
 * One queue, one job per event, `singletonKey` = the event id (design D2).
 * Retries are owned by the outbox row, so the queue never retries a job: the
 * relay re-enqueues the row when its own backoff or lease says it is due.
 */
export class PgBossOutboxQueue implements OutboxQueue {
  constructor(private readonly boss: PgBoss) {}

  async enqueue(eventId: string): Promise<void> {
    await this.boss.send(
      OUTBOX_QUEUE,
      { eventId },
      { singletonKey: eventId, retryLimit: 0 },
    );
  }
}
