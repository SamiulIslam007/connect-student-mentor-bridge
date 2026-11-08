import assert from "node:assert/strict";
import { after, before, test, type TestContext } from "node:test";

import { PgBoss } from "pg-boss";

import { createDatabaseConnection, type DatabaseConnection } from "../src/db/database.js";
import {
  enqueueOutboxEvent,
  outboxEventId,
  type OutboxEventInput,
} from "../src/platform/outbox/outbox.js";
import {
  emailRequestedHandler,
  processOutboxEvent,
  type OutboxHandlerMap,
} from "../src/platform/outbox/outbox-processor.js";
import { relayOutboxBatch, type OutboxQueue } from "../src/platform/outbox/outbox-relay.js";
import { RecordingEmailSender } from "./support/api-stack.js";
import {
  openTestDatabase,
  resetDatabase,
  testDatabaseUrl,
  truncateAll,
  type TestDatabase,
} from "./support/database.js";

let database: TestDatabase | undefined;
let connection: DatabaseConnection | undefined;

before(async () => {
  database = await openTestDatabase();
  if (database.skipped) {
    return;
  }
  await resetDatabase(database.client);
  connection = createDatabaseConnection(testDatabaseUrl());
});

after(async () => {
  await connection?.pool.end();
  if (database && !database.skipped) {
    await database.client.end();
  }
});

function requireConnection(context: TestContext): DatabaseConnection | null {
  if (!connection || !database || database.skipped) {
    context.skip(database?.reason ?? "connect_test is not reachable");
    return null;
  }
  return connection;
}

class RecordingQueue implements OutboxQueue {
  readonly eventIds: string[] = [];

  async enqueue(eventId: string): Promise<void> {
    this.eventIds.push(eventId);
  }
}

function event(overrides: Partial<OutboxEventInput> = {}): OutboxEventInput {
  return {
    aggregateType: "TEST",
    aggregateId: "aggregate-1",
    eventType: "EmailRequested",
    payload: {
      to: "outbox@example.com",
      template: "outbox-test",
      subject: "Outbox test",
      text: "Delivered by the worker.",
    },
    dedupeKey: `test:${Math.random().toString(36).slice(2)}`,
    ...overrides,
  };
}

async function resetOutbox(current: DatabaseConnection): Promise<void> {
  await truncateAll(database!.client);
  await database!.client.query("DELETE FROM outbox_events");
  void current;
}

test("a duplicate dedupe key inserts nothing and does not raise", async (context) => {
  const current = requireConnection(context);
  if (!current) return;
  await resetOutbox(current);

  const input = event({ dedupeKey: "request:1:received" });
  assert.equal(await enqueueOutboxEvent(current.db, input), true);
  assert.equal(await enqueueOutboxEvent(current.db, input), false);

  const rows = await database!.client.query("SELECT id FROM outbox_events");
  assert.equal(rows.rowCount, 1);
});

test("an event and its cause share a transaction", async (context) => {
  const current = requireConnection(context);
  if (!current) return;
  await resetOutbox(current);

  await assert.rejects(
    current.db.transaction(async (tx) => {
      await enqueueOutboxEvent(tx, event({ dedupeKey: "rollback:1" }));
      throw new Error("the state change failed");
    }),
    /the state change failed/,
  );
  const rows = await database!.client.query("SELECT id FROM outbox_events");
  assert.equal(rows.rowCount, 0, "a rolled back transaction leaves no event");
});

test("the relay enqueues only due, unprocessed rows", async (context) => {
  const current = requireConnection(context);
  if (!current) return;
  await resetOutbox(current);

  const due = event({ dedupeKey: "due:1" });
  const future = event({
    dedupeKey: "future:1",
    availableAt: new Date(Date.now() + 60 * 60 * 1000),
  });
  await enqueueOutboxEvent(current.db, due);
  await enqueueOutboxEvent(current.db, future);
  const processed = event({ dedupeKey: "processed:1" });
  await enqueueOutboxEvent(current.db, processed);
  await database!.client.query("UPDATE outbox_events SET processed_at = now() WHERE dedupe_key = $1", [
    processed.dedupeKey,
  ]);

  const queue = new RecordingQueue();
  const count = await relayOutboxBatch(current.db, queue);
  assert.equal(count, 1);
  assert.deepEqual(queue.eventIds, [await outboxEventId(current.db, due.dedupeKey)]);

  // The lease keeps the same row out of the next poll while its job is in flight.
  const again = await relayOutboxBatch(current.db, queue);
  assert.equal(again, 0, "a leased row is not enqueued twice");
});

test("a handler marks the event processed and a redelivery sends nothing", async (context) => {
  const current = requireConnection(context);
  if (!current) return;
  await resetOutbox(current);

  const sender = new RecordingEmailSender();
  const handlers: OutboxHandlerMap = { EmailRequested: emailRequestedHandler(sender) };
  const input = event({ dedupeKey: "process:1" });
  await enqueueOutboxEvent(current.db, input);
  const id = await outboxEventId(current.db, input.dedupeKey);
  assert.ok(id);

  assert.equal(await processOutboxEvent(current.db, id, handlers), "processed");
  assert.equal(sender.messages.length, 1);
  assert.equal(sender.messages[0].template, "outbox-test");
  const processed = await database!.client.query<{ processed_at: Date | null }>(
    "SELECT processed_at FROM outbox_events WHERE id = $1",
    [id],
  );
  assert.ok(processed.rows[0].processed_at);

  assert.equal(await processOutboxEvent(current.db, id, handlers), "processed");
  assert.equal(sender.messages.length, 1, "a redelivered event sends no second email");
});

test("a failing handler records the attempt and schedules a backoff", async (context) => {
  const current = requireConnection(context);
  if (!current) return;
  await resetOutbox(current);

  const handlers: OutboxHandlerMap = {
    EmailRequested: async () => {
      throw new Error("smtp is down");
    },
  };
  const input = event({ dedupeKey: "retry:1" });
  await enqueueOutboxEvent(current.db, input);
  const id = await outboxEventId(current.db, input.dedupeKey);
  assert.ok(id);

  assert.equal(await processOutboxEvent(current.db, id, handlers), "retry");
  const row = await database!.client.query<{
    attempts: number;
    last_error: string;
    processed_at: Date | null;
    failed_at: Date | null;
    available_at: Date;
  }>(
    "SELECT attempts, last_error, processed_at, failed_at, available_at FROM outbox_events WHERE id = $1",
    [id],
  );
  assert.equal(row.rows[0].attempts, 1);
  assert.equal(row.rows[0].last_error, "smtp is down");
  assert.equal(row.rows[0].processed_at, null);
  assert.equal(row.rows[0].failed_at, null);
  assert.ok(
    row.rows[0].available_at.getTime() > Date.now() + 20_000,
    "the next attempt is scheduled with backoff",
  );
});

test("the attempt budget ends in failed_at and the row is kept", async (context) => {
  const current = requireConnection(context);
  if (!current) return;
  await resetOutbox(current);

  const handlers: OutboxHandlerMap = {
    EmailRequested: async () => {
      throw new Error("smtp is still down");
    },
  };
  const input = event({ dedupeKey: "budget:1" });
  await enqueueOutboxEvent(current.db, input);
  const id = await outboxEventId(current.db, input.dedupeKey);
  assert.ok(id);

  assert.equal(await processOutboxEvent(current.db, id, handlers, { maxAttempts: 2 }), "retry");
  assert.equal(await processOutboxEvent(current.db, id, handlers, { maxAttempts: 2 }), "failed");

  const row = await database!.client.query<{
    attempts: number;
    processed_at: Date | null;
    failed_at: Date | null;
  }>("SELECT attempts, processed_at, failed_at FROM outbox_events WHERE id = $1", [id]);
  assert.equal(row.rows[0].attempts, 2);
  assert.equal(row.rows[0].processed_at, null);
  assert.ok(row.rows[0].failed_at, "the permanently failed row carries failed_at");
});

test("an unregistered event type fails loudly and is not marked processed", async (context) => {
  const current = requireConnection(context);
  if (!current) return;
  await resetOutbox(current);

  const input = event({ dedupeKey: "typo:1", eventType: "RequestAcepted" });
  await enqueueOutboxEvent(current.db, input);
  const id = await outboxEventId(current.db, input.dedupeKey);
  assert.ok(id);

  const handlers: OutboxHandlerMap = {
    EmailRequested: emailRequestedHandler(new RecordingEmailSender()),
  };
  assert.equal(await processOutboxEvent(current.db, id, handlers), "retry");
  const row = await database!.client.query<{ last_error: string; processed_at: Date | null }>(
    "SELECT last_error, processed_at FROM outbox_events WHERE id = $1",
    [id],
  );
  assert.equal(row.rows[0].last_error, "unknown event type: RequestAcepted");
  assert.equal(row.rows[0].processed_at, null);
});

test("pg-boss starts against the migrated schema and accepts a job", async (context) => {
  const current = requireConnection(context);
  if (!current) return;

  const boss = new PgBoss({
    connectionString: testDatabaseUrl(),
    schema: "pgboss",
    schedule: false,
  });
  try {
    await boss.start();
    await boss.createQueue("outbox-probe");
    const id = await boss.send("outbox-probe", { probe: true });
    assert.ok(id, "pg-boss accepted a job on the migrated schema");
  } finally {
    await boss.stop({ graceful: false });
  }
});
