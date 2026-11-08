CREATE TYPE "public"."reputation_event_type" AS ENUM('COUNTED', 'REVERSAL');--> statement-breakpoint
CREATE TABLE "field_impact_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mentor_profile_id" uuid NOT NULL,
	"field_id" uuid NOT NULL,
	"outcome_type" "outcome_type" NOT NULL,
	"counted_count" integer DEFAULT 0 NOT NULL,
	"points_total" numeric(12, 6) DEFAULT '0' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "field_impact_snapshots_count_non_negative" CHECK ("field_impact_snapshots"."counted_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "reputation_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"outcome_id" uuid NOT NULL,
	"mentor_profile_id" uuid NOT NULL,
	"student_profile_id" uuid NOT NULL,
	"field_id" uuid NOT NULL,
	"outcome_type" "outcome_type" NOT NULL,
	"event_type" "reputation_event_type" NOT NULL,
	"difficulty_weight" numeric(6, 4) NOT NULL,
	"tier_multiplier" numeric(6, 4) NOT NULL,
	"contribution_multiplier" numeric(6, 4) NOT NULL,
	"pair_factor" numeric(6, 4) NOT NULL,
	"points" numeric(12, 6) NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reputation_events_counted_only" CHECK ("reputation_events"."event_type" = 'COUNTED')
);
--> statement-breakpoint
ALTER TABLE "field_impact_snapshots" ADD CONSTRAINT "field_impact_snapshots_mentor_profile_id_mentor_profiles_id_fk" FOREIGN KEY ("mentor_profile_id") REFERENCES "public"."mentor_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "field_impact_snapshots" ADD CONSTRAINT "field_impact_snapshots_field_id_fields_id_fk" FOREIGN KEY ("field_id") REFERENCES "public"."fields"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reputation_events" ADD CONSTRAINT "reputation_events_outcome_id_outcomes_id_fk" FOREIGN KEY ("outcome_id") REFERENCES "public"."outcomes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reputation_events" ADD CONSTRAINT "reputation_events_mentor_profile_id_mentor_profiles_id_fk" FOREIGN KEY ("mentor_profile_id") REFERENCES "public"."mentor_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reputation_events" ADD CONSTRAINT "reputation_events_student_profile_id_student_profiles_id_fk" FOREIGN KEY ("student_profile_id") REFERENCES "public"."student_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reputation_events" ADD CONSTRAINT "reputation_events_field_id_fields_id_fk" FOREIGN KEY ("field_id") REFERENCES "public"."fields"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "field_impact_snapshots_key" ON "field_impact_snapshots" USING btree ("mentor_profile_id","field_id","outcome_type");--> statement-breakpoint
CREATE UNIQUE INDEX "reputation_events_outcome_unique" ON "reputation_events" USING btree ("outcome_id");--> statement-breakpoint
CREATE INDEX "reputation_events_mentor_field_idx" ON "reputation_events" USING btree ("mentor_profile_id","field_id","occurred_at");
--> statement-breakpoint
GRANT SELECT, INSERT ON TABLE "reputation_events" TO connect_app;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON TABLE "field_impact_snapshots" TO connect_app;
