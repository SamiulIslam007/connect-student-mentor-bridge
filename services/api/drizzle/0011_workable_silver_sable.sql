CREATE TYPE "public"."interaction_type" AS ENUM('ASYNC_THREAD', 'ONE_TO_ONE_SESSION', 'GROUP_OFFICE_HOURS');--> statement-breakpoint
CREATE TYPE "public"."outcome_type" AS ENUM('ADMISSION', 'INTERNSHIP', 'JOB_OFFER', 'SKILL_MILESTONE', 'INTERVIEW');--> statement-breakpoint
CREATE TYPE "public"."request_status" AS ENUM('PENDING', 'ACCEPTED', 'DECLINED', 'REDIRECTED', 'EXPIRED', 'WITHDRAWN');--> statement-breakpoint
CREATE TYPE "public"."timeframe_bucket" AS ENUM('WITHIN_1_MONTH', 'ONE_TO_3_MONTHS', 'THREE_TO_6_MONTHS', 'OVER_6_MONTHS');--> statement-breakpoint
CREATE TABLE "mentorship_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_profile_id" uuid NOT NULL,
	"mentor_profile_id" uuid NOT NULL,
	"field_id" uuid NOT NULL,
	"question" text NOT NULL,
	"context_summary" text NOT NULL,
	"target_outcome" text NOT NULL,
	"target_outcome_type" "outcome_type",
	"timeframe" timeframe_bucket NOT NULL,
	"interaction_type" "interaction_type" DEFAULT 'ASYNC_THREAD' NOT NULL,
	"application_note" text,
	"status" "request_status" DEFAULT 'PENDING' NOT NULL,
	"decided_at" timestamp with time zone,
	"decision_note" text,
	"expires_at" timestamp with time zone NOT NULL,
	"reminder_sent_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mentorship_requests_no_group_office_hours" CHECK ("mentorship_requests"."interaction_type" <> 'GROUP_OFFICE_HOURS'),
	CONSTRAINT "mentorship_requests_version_min" CHECK ("mentorship_requests"."version" >= 1),
	CONSTRAINT "mentorship_requests_expires_after_creation" CHECK ("mentorship_requests"."expires_at" > "mentorship_requests"."created_at")
);
--> statement-breakpoint
ALTER TABLE "mentorship_requests" ADD CONSTRAINT "mentorship_requests_student_profile_id_student_profiles_id_fk" FOREIGN KEY ("student_profile_id") REFERENCES "public"."student_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentorship_requests" ADD CONSTRAINT "mentorship_requests_mentor_profile_id_mentor_profiles_id_fk" FOREIGN KEY ("mentor_profile_id") REFERENCES "public"."mentor_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentorship_requests" ADD CONSTRAINT "mentorship_requests_field_id_fields_id_fk" FOREIGN KEY ("field_id") REFERENCES "public"."fields"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "mentorship_requests_one_pending_per_pair" ON "mentorship_requests" USING btree ("student_profile_id","mentor_profile_id") WHERE "mentorship_requests"."status" = 'PENDING';--> statement-breakpoint
CREATE INDEX "mentorship_requests_mentor_status_idx" ON "mentorship_requests" USING btree ("mentor_profile_id","status");--> statement-breakpoint
CREATE INDEX "mentorship_requests_student_status_idx" ON "mentorship_requests" USING btree ("student_profile_id","status");--> statement-breakpoint
CREATE INDEX "mentorship_requests_due_idx" ON "mentorship_requests" USING btree ("status","expires_at");--> statement-breakpoint
-- Hand-written (design D1): the application role grant.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "mentorship_requests" TO connect_app;