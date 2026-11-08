CREATE TYPE "public"."mentorship_cadence" AS ENUM('WEEKLY', 'BIWEEKLY', 'MONTHLY', 'AD_HOC');--> statement-breakpoint
CREATE TYPE "public"."mentorship_session_status" AS ENUM('SCHEDULED', 'HELD', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."mentorship_status" AS ENUM('ACTIVE', 'COMPLETED', 'ENDED_EARLY');--> statement-breakpoint
CREATE TABLE "mentorship_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mentorship_id" uuid NOT NULL,
	"created_by_user_id" text NOT NULL,
	"scheduled_start" timestamp with time zone NOT NULL,
	"duration_minutes" smallint NOT NULL,
	"meeting_url" text NOT NULL,
	"status" "mentorship_session_status" DEFAULT 'SCHEDULED' NOT NULL,
	"student_confirmed_held_at" timestamp with time zone,
	"mentor_confirmed_held_at" timestamp with time zone,
	"cancelled_by_user_id" text,
	"cancel_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mentorship_sessions_https_link" CHECK ("mentorship_sessions"."meeting_url" LIKE 'https://%'),
	CONSTRAINT "mentorship_sessions_duration_range" CHECK ("mentorship_sessions"."duration_minutes" >= 15 AND "mentorship_sessions"."duration_minutes" <= 240),
	CONSTRAINT "mentorship_sessions_held_has_both_confirmations" CHECK ("mentorship_sessions"."status" <> 'HELD' OR ("mentorship_sessions"."student_confirmed_held_at" IS NOT NULL AND "mentorship_sessions"."mentor_confirmed_held_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "mentorships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"student_profile_id" uuid NOT NULL,
	"mentor_profile_id" uuid NOT NULL,
	"field_id" uuid NOT NULL,
	"status" "mentorship_status" DEFAULT 'ACTIVE' NOT NULL,
	"cadence" "mentorship_cadence",
	"planned_weeks" smallint,
	"goal" text,
	"student_ack_at" timestamp with time zone,
	"mentor_ack_at" timestamp with time zone,
	"is_paid" boolean DEFAULT false NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"ended_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mentorships_not_paid" CHECK ("mentorships"."is_paid" = false),
	CONSTRAINT "mentorships_planned_weeks_range" CHECK ("mentorships"."planned_weeks" IS NULL OR ("mentorships"."planned_weeks" >= 1 AND "mentorships"."planned_weeks" <= 52)),
	CONSTRAINT "mentorships_ended_after_start" CHECK ("mentorships"."ended_at" IS NULL OR "mentorships"."ended_at" >= "mentorships"."started_at")
);
--> statement-breakpoint
CREATE TABLE "thread_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mentorship_id" uuid NOT NULL,
	"sender_user_id" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "mentorship_sessions" ADD CONSTRAINT "mentorship_sessions_mentorship_id_mentorships_id_fk" FOREIGN KEY ("mentorship_id") REFERENCES "public"."mentorships"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentorship_sessions" ADD CONSTRAINT "mentorship_sessions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentorship_sessions" ADD CONSTRAINT "mentorship_sessions_cancelled_by_user_id_users_id_fk" FOREIGN KEY ("cancelled_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentorships" ADD CONSTRAINT "mentorships_request_id_mentorship_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."mentorship_requests"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentorships" ADD CONSTRAINT "mentorships_student_profile_id_student_profiles_id_fk" FOREIGN KEY ("student_profile_id") REFERENCES "public"."student_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentorships" ADD CONSTRAINT "mentorships_mentor_profile_id_mentor_profiles_id_fk" FOREIGN KEY ("mentor_profile_id") REFERENCES "public"."mentor_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentorships" ADD CONSTRAINT "mentorships_field_id_fields_id_fk" FOREIGN KEY ("field_id") REFERENCES "public"."fields"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentorships" ADD CONSTRAINT "mentorships_ended_by_user_id_users_id_fk" FOREIGN KEY ("ended_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "thread_messages" ADD CONSTRAINT "thread_messages_mentorship_id_mentorships_id_fk" FOREIGN KEY ("mentorship_id") REFERENCES "public"."mentorships"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "thread_messages" ADD CONSTRAINT "thread_messages_sender_user_id_users_id_fk" FOREIGN KEY ("sender_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mentorship_sessions_schedule_idx" ON "mentorship_sessions" USING btree ("mentorship_id","scheduled_start");--> statement-breakpoint
CREATE UNIQUE INDEX "mentorships_request_id_unique" ON "mentorships" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "mentorships_mentor_active_idx" ON "mentorships" USING btree ("mentor_profile_id","status") WHERE "mentorships"."status" = 'ACTIVE';--> statement-breakpoint
CREATE INDEX "thread_messages_keyset_idx" ON "thread_messages" USING btree ("mentorship_id","created_at","id");
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "mentorships" TO connect_app;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "thread_messages" TO connect_app;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "mentorship_sessions" TO connect_app;
