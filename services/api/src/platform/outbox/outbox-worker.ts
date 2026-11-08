import { Inject, Injectable, type OnApplicationBootstrap, type OnApplicationShutdown } from "@nestjs/common";
import { PgBoss } from "pg-boss";

import { DATABASE } from "../../db/database.module.js";
import type { Database } from "../../db/database.js";
import { resolveDatabaseUrl } from "../../db/database-url.js";
import { EMAIL_SENDER } from "../../identity/identity.tokens.js";
import type { EmailSender } from "../../email/email-sender.js";
import { OUTBOX_QUEUE, outboxPollIntervalMs } from "./outbox.js";
import {
  emailRequestedHandler,
  processOutboxEvent,
  type OutboxHandlerMap,
} from "./outbox-processor.js";
import { relayOutboxBatch } from "./outbox-relay.js";
import { PgBossOutboxQueue } from "./pg-boss-queue.js";
import {
  REQUEST_SWEEP_CRON,
  REQUEST_SWEEP_QUEUE,
  sweepRequests,
} from "../../requests/request-sweeper.js";

const log = (event: string, detail: Record<string, unknown> = {}): void => {
  console.log(JSON.stringify({ event, ...detail }));
};

/**
 * The worker process (design D5): one relay timer that turns due outbox rows into
 * pg-boss jobs, and one pg-boss worker that runs the registered handler. Both
 * use the same database handle and `EmailSender` as the API.
 */
@Injectable()
export class OutboxWorker implements OnApplicationBootstrap, OnApplicationShutdown {
  private boss?: PgBoss;
  private timer?: NodeJS.Timeout;
  private polling = false;
  private handlers: OutboxHandlerMap = {};

  constructor(
    @Inject(DATABASE) private readonly database: Database,
    @Inject(EMAIL_SENDER) private readonly emailSender: EmailSender,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    // Built here, not as a field initializer: a parameter property is not
    // guaranteed to be assigned before class fields initialize.
    this.handlers = { EmailRequested: emailRequestedHandler(this.emailSender) };
    const boss = new PgBoss({
      connectionString: resolveDatabaseUrl(),
      // Created and granted by migration `0010`; pg-boss creates its tables inside.
      schema: "pgboss",
      schedule: false,
    });
    await boss.start();
    await boss.createQueue(OUTBOX_QUEUE);
    await boss.createQueue(REQUEST_SWEEP_QUEUE);
    await boss.work(REQUEST_SWEEP_QUEUE, { batchSize: 1 }, async () => {
      const result = await sweepRequests(this.database);
      if (result.reminded > 0 || result.expired > 0) {
        log("requests.swept", { reminded: result.reminded, expired: result.expired });
      }
    });
    await boss.schedule(REQUEST_SWEEP_QUEUE, REQUEST_SWEEP_CRON);
    await boss.work(
      OUTBOX_QUEUE,
      { batchSize: 1, pollingIntervalSeconds: 2 },
      async (jobs) => {
        for (const job of jobs) {
          const eventId = (job.data as { eventId?: unknown } | null)?.eventId;
          if (typeof eventId !== "string") {
            throw new Error("an outbox job carried no event id");
          }
          await processOutboxEvent(this.database, eventId, this.handlers);
        }
      },
    );
    this.boss = boss;
    this.timer = setInterval(() => void this.relay(), outboxPollIntervalMs());
    await this.relay();
    log("worker.started", { service: "api-worker", queue: OUTBOX_QUEUE });
  }

  async onApplicationShutdown(signal?: string): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
    await this.boss?.stop({ graceful: true });
    this.boss = undefined;
    log("worker.stopped", { signal });
  }

  private async relay(): Promise<void> {
    if (this.polling || !this.boss) {
      return;
    }
    this.polling = true;
    try {
      const count = await relayOutboxBatch(this.database, new PgBossOutboxQueue(this.boss));
      if (count > 0) {
        log("outbox.relayed", { count });
      }
    } catch (error) {
      // One structured line is the MVP's alert; the next tick retries.
      log("outbox.relay_failed", {
        message: error instanceof Error ? error.message : "unknown error",
      });
    } finally {
      this.polling = false;
    }
  }
}
