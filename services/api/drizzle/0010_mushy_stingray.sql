CREATE TABLE "outbox_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"aggregate_type" text NOT NULL,
	"aggregate_id" text NOT NULL,
	"event_type" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"dedupe_key" text NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"failed_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "outbox_events_attempts_min" CHECK ("outbox_events"."attempts" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "outbox_events_dedupe_key_unique" ON "outbox_events" USING btree ("dedupe_key");--> statement-breakpoint
CREATE INDEX "outbox_events_due_idx" ON "outbox_events" USING btree ("processed_at","available_at");--> statement-breakpoint
-- Hand-written (design D3): the application role grant, plus the queue schema
-- the worker needs. pg-boss creates its own tables at boot with `CREATE`, which
-- is why the worker never needs owner rights.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "outbox_events" TO connect_app;--> statement-breakpoint
CREATE SCHEMA IF NOT EXISTS "pgboss";--> statement-breakpoint
GRANT USAGE, CREATE ON SCHEMA "pgboss" TO connect_app;