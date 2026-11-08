import { and, eq, isNull } from "drizzle-orm";

import type { EmailMessage, EmailSender } from "../../email/email-sender.js";
import type { Database } from "../../db/database.js";
import { outboxEvents } from "../../db/schema/index.js";
import { OUTBOX_RETRY_DELAY_SECONDS, outboxMaxAttempts } from "./outbox.js";

const log = (event: string, detail: Record<string, unknown> = {}): void => {
  console.log(JSON.stringify({ event, ...detail }));
};

export type OutboxHandler = (payload: Record<string, unknown>) => Promise<void>;
export type OutboxHandlerMap = Record<string, OutboxHandler>;

function text(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`the ${field} of an EmailRequested payload must be a non-empty string`);
  }
  return value;
}

/**
 * The first registered handler (design D6). It is idempotent because the caller
 * only invokes it for an unprocessed row and marks the row processed after it
 * resolves; a redelivery therefore sends nothing.
 */
export function emailRequestedHandler(sender: EmailSender): OutboxHandler {
  return async (payload) => {
    const message: EmailMessage = {
      to: text(payload.to, "to"),
      template: (typeof payload.template === "string" ? payload.template : "outbox-test") as EmailMessage["template"],
      subject: text(payload.subject, "subject"),
      text: text(payload.text, "text"),
    };
    await sender.send(message);
  };
}

export type OutboxOutcome = "processed" | "retry" | "failed" | "ignored";

export interface ProcessOutboxOptions {
  maxAttempts?: number;
  now?: Date;
}

/**
 * Runs one event's handler and settles its row (design D2/D8). The failure is
 * recorded and committed before the error is rethrown, so a queue retry sees the
 * attempt count. The budget is bounded: the last failure sets `failed_at` and is
 * swallowed, so the queue stops retrying and the row stays visible.
 */
export async function processOutboxEvent(
  database: Database,
  eventId: string,
  handlers: OutboxHandlerMap,
  options: ProcessOutboxOptions = {},
): Promise<OutboxOutcome> {
  const maxAttempts = options.maxAttempts ?? outboxMaxAttempts();
  const now = options.now ?? new Date();

  const outcome = await database.transaction(async (tx) => {
    const [row] = await tx
      .select({
        id: outboxEvents.id,
        eventType: outboxEvents.eventType,
        payload: outboxEvents.payload,
        attempts: outboxEvents.attempts,
        availableAt: outboxEvents.availableAt,
        processedAt: outboxEvents.processedAt,
        failedAt: outboxEvents.failedAt,
      })
      .from(outboxEvents)
      .where(eq(outboxEvents.id, eventId))
      .for("update")
      .limit(1);
    if (!row) {
      return { kind: "ignored" as const };
    }
    if (row.processedAt) {
      return { kind: "processed" as const };
    }
    if (row.failedAt) {
      return { kind: "failed" as const };
    }

    try {
      const handler = handlers[row.eventType];
      if (!handler) {
        throw new Error(`unknown event type: ${row.eventType}`);
      }
      await handler(row.payload);
      await tx
        .update(outboxEvents)
        .set({ processedAt: now, updatedAt: now })
        .where(and(eq(outboxEvents.id, eventId), isNull(outboxEvents.processedAt)));
      return { kind: "processed" as const };
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown error";
      const attempts = row.attempts + 1;
      const exhausted = attempts >= maxAttempts;
      // The row, not the queue, owns the retry schedule: a failed attempt moves
      // `available_at` forward and the relay enqueues it again when it is due.
      const backoffSeconds = Math.min(
        OUTBOX_RETRY_DELAY_SECONDS * 2 ** (attempts - 1),
        60 * 60,
      );
      await tx
        .update(outboxEvents)
        .set({
          attempts,
          lastError: message,
          failedAt: exhausted ? now : null,
          availableAt: exhausted
            ? row.availableAt
            : new Date(now.getTime() + backoffSeconds * 1000),
          updatedAt: now,
        })
        .where(eq(outboxEvents.id, eventId));
      return { kind: exhausted ? ("failed" as const) : ("retry" as const), message };
    }
  });

  if (outcome.kind === "retry") {
    log("outbox.event_retry", { event_id: eventId, message: outcome.message });
  }
  if (outcome.kind === "failed") {
    log("outbox.event_failed", { event_id: eventId, message: outcome.message });
  }
  return outcome.kind;
}
