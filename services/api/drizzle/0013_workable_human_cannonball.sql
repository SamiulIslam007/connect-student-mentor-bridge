CREATE TYPE "public"."contribution_level" AS ENUM('DIRECTLY_ENABLED', 'HELPED', 'MINOR');--> statement-breakpoint
CREATE TYPE "public"."outcome_event_type" AS ENUM('REPORTED', 'EVIDENCE_ADDED', 'EVIDENCE_REMOVED', 'REMINDER_D3_SENT', 'REMINDER_D5_SENT', 'ESCALATED_D7', 'CONFIRMED', 'CONTRIBUTION_AMENDED', 'DISPUTED', 'COI_DECLARED', 'CASE_OPENED', 'CASE_RESOLVED', 'TIER_CHANGED', 'COUNTED', 'REJECTED', 'WITHDRAWN', 'REVERSED');--> statement-breakpoint
CREATE TYPE "public"."outcome_status" AS ENUM('PENDING_CONFIRMATION', 'CONFIRMED', 'IN_PLATFORM_REVIEW', 'COUNTED', 'REJECTED', 'WITHDRAWN', 'REVERSED');--> statement-breakpoint
CREATE TYPE "public"."verifier_decision" AS ENUM('CONFIRMED', 'DISPUTED', 'DECLARED', 'VALID', 'NOT_VALID', 'PASSED', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."verifier_kind" AS ENUM('MENTOR_CONFIRMATION', 'MENTOR_DISPUTE', 'CONFLICT_OF_INTEREST', 'THIRD_PARTY_CONFIRMATION', 'AUDIT_RESULT', 'PLATFORM_DECISION', 'APPEAL_DECISION');--> statement-breakpoint
CREATE TABLE "outcome_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"outcome_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"event_type" "outcome_event_type" NOT NULL,
	"actor_user_id" text,
	"actor_role" text,
	"from_status" "outcome_status",
	"to_status" "outcome_status",
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"request_id" text NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outcomes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mentorship_id" uuid NOT NULL,
	"student_profile_id" uuid NOT NULL,
	"mentor_profile_id" uuid NOT NULL,
	"field_id" uuid NOT NULL,
	"outcome_type" "outcome_type" NOT NULL,
	"title" text,
	"description" text NOT NULL,
	"occurred_on" date DEFAULT now() NOT NULL,
	"contribution_claimed" "contribution_level" NOT NULL,
	"contribution_confirmed" "contribution_level",
	"status" "outcome_status" DEFAULT 'PENDING_CONFIRMATION' NOT NULL,
	"evidence_tier" smallint DEFAULT 0 NOT NULL,
	"counted_basis" text,
	"coi_declared" boolean DEFAULT false NOT NULL,
	"is_paid_relationship" boolean DEFAULT false NOT NULL,
	"mentor_decision_due_at" timestamp with time zone NOT NULL,
	"confirmed_at" timestamp with time zone,
	"cooling_ends_at" timestamp with time zone,
	"counted_at" timestamp with time zone,
	"rejected_at" timestamp with time zone,
	"withdrawn_at" timestamp with time zone,
	"reversed_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "outcomes_description_bounds" CHECK (length("outcomes"."description") BETWEEN 1 AND 2000),
	CONSTRAINT "outcomes_evidence_tier_range" CHECK ("outcomes"."evidence_tier" BETWEEN 0 AND 2),
	CONSTRAINT "outcomes_counted_has_basis" CHECK ("outcomes"."status" <> 'COUNTED' OR "outcomes"."counted_basis" IS NOT NULL),
	CONSTRAINT "outcomes_counted_basis_known" CHECK ("outcomes"."counted_basis" IS NULL OR "outcomes"."counted_basis" IN ('MENTOR_CONFIRMED', 'PLATFORM_DECISION'))
);
--> statement-breakpoint
CREATE TABLE "verification_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"outcome_id" uuid NOT NULL,
	"kind" "verifier_kind" NOT NULL,
	"decision" "verifier_decision" NOT NULL,
	"attester_user_id" text,
	"contribution_level" "contribution_level",
	"coi_declaration" jsonb,
	"statement" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "outcome_events" ADD CONSTRAINT "outcome_events_outcome_id_outcomes_id_fk" FOREIGN KEY ("outcome_id") REFERENCES "public"."outcomes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outcome_events" ADD CONSTRAINT "outcome_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outcomes" ADD CONSTRAINT "outcomes_mentorship_id_mentorships_id_fk" FOREIGN KEY ("mentorship_id") REFERENCES "public"."mentorships"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outcomes" ADD CONSTRAINT "outcomes_student_profile_id_student_profiles_id_fk" FOREIGN KEY ("student_profile_id") REFERENCES "public"."student_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outcomes" ADD CONSTRAINT "outcomes_mentor_profile_id_mentor_profiles_id_fk" FOREIGN KEY ("mentor_profile_id") REFERENCES "public"."mentor_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outcomes" ADD CONSTRAINT "outcomes_field_id_fields_id_fk" FOREIGN KEY ("field_id") REFERENCES "public"."fields"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_records" ADD CONSTRAINT "verification_records_outcome_id_outcomes_id_fk" FOREIGN KEY ("outcome_id") REFERENCES "public"."outcomes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_records" ADD CONSTRAINT "verification_records_attester_user_id_users_id_fk" FOREIGN KEY ("attester_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "outcome_events_seq_unique" ON "outcome_events" USING btree ("outcome_id","seq");--> statement-breakpoint
CREATE UNIQUE INDEX "outcome_events_timer_once" ON "outcome_events" USING btree ("outcome_id","event_type") WHERE "outcome_events"."event_type" IN ('REMINDER_D3_SENT', 'REMINDER_D5_SENT', 'ESCALATED_D7');--> statement-breakpoint
CREATE INDEX "outcome_events_outcome_idx" ON "outcome_events" USING btree ("outcome_id","seq");--> statement-breakpoint
CREATE INDEX "outcomes_mentor_field_status_idx" ON "outcomes" USING btree ("mentor_profile_id","field_id","status");--> statement-breakpoint
CREATE INDEX "outcomes_student_idx" ON "outcomes" USING btree ("student_profile_id");--> statement-breakpoint
CREATE INDEX "outcomes_due_idx" ON "outcomes" USING btree ("status","mentor_decision_due_at");--> statement-breakpoint
CREATE INDEX "outcomes_cooling_idx" ON "outcomes" USING btree ("status","cooling_ends_at");--> statement-breakpoint
CREATE INDEX "verification_records_outcome_idx" ON "verification_records" USING btree ("outcome_id");
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "outcomes" TO connect_app;--> statement-breakpoint
GRANT SELECT, INSERT ON TABLE "outcome_events" TO connect_app;--> statement-breakpoint
GRANT SELECT, INSERT ON TABLE "verification_records" TO connect_app;
