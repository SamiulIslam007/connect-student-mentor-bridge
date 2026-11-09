ALTER TABLE "reputation_events" DROP CONSTRAINT "reputation_events_counted_only";--> statement-breakpoint
DROP INDEX "reputation_events_outcome_unique";--> statement-breakpoint
CREATE UNIQUE INDEX "reputation_events_counted_unique" ON "reputation_events" USING btree ("outcome_id") WHERE "reputation_events"."event_type" = 'COUNTED';--> statement-breakpoint
CREATE UNIQUE INDEX "reputation_events_reversal_unique" ON "reputation_events" USING btree ("outcome_id") WHERE "reputation_events"."event_type" = 'REVERSAL';--> statement-breakpoint
ALTER TABLE "reputation_events" ADD CONSTRAINT "reputation_events_counted_only" CHECK ("reputation_events"."event_type" IN ('COUNTED', 'REVERSAL'));