import { createDatabaseConnection } from "../../db/database.js";
import { resolveDatabaseUrl } from "../../db/database-url.js";
import { enqueueOutboxEvent, outboxEventId } from "./outbox.js";

/**
 * Writes one `EmailRequested` event so a queued email can be delivered, and
 * retried, against Mailpit (design D7). A script, not a route: the API keeps no
 * write path that a later change has to remove.
 */
async function main(): Promise<void> {
  const to = process.argv[2]?.trim();
  if (!to) {
    console.error("usage: pnpm --filter api outbox:test-event <email>");
    process.exit(1);
  }

  const connection = createDatabaseConnection(resolveDatabaseUrl());
  try {
    const dedupeKey = `outbox-test:${to.toLowerCase()}`;
    const inserted = await enqueueOutboxEvent(connection.db, {
      aggregateType: "OUTBOX_TEST",
      aggregateId: dedupeKey,
      eventType: "EmailRequested",
      payload: {
        to,
        template: "outbox-test",
        subject: "connect outbox test",
        text: [
          "This message was written to the outbox and delivered by the worker.",
          "",
          "If the SMTP host is unreachable, the event is retried with backoff and then marked failed.",
        ].join("\n"),
      },
      dedupeKey,
    });
    const id = await outboxEventId(connection.db, dedupeKey);
    console.log(JSON.stringify({ event: "outbox.test_event", id, inserted, dedupe_key: dedupeKey }));
  } finally {
    await connection.pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(
    JSON.stringify({
      event: "outbox.test_event_failed",
      message: error instanceof Error ? error.message : "unknown error",
    }),
  );
  process.exit(1);
});
