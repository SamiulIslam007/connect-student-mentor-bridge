CREATE TYPE "public"."availability_context" AS ENUM('STUDENT', 'MENTOR');--> statement-breakpoint
CREATE TYPE "public"."mentor_access_mode" AS ENUM('OPEN', 'APPLICATION_ONLY', 'PAUSED');--> statement-breakpoint
CREATE TABLE "availability_windows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"context" "availability_context" NOT NULL,
	"weekday" smallint NOT NULL,
	"start_minute" smallint NOT NULL,
	"end_minute" smallint NOT NULL,
	"timezone" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "availability_windows_weekday_range" CHECK ("availability_windows"."weekday" BETWEEN 1 AND 7),
	CONSTRAINT "availability_windows_start_range" CHECK ("availability_windows"."start_minute" BETWEEN 0 AND 1440),
	CONSTRAINT "availability_windows_end_range" CHECK ("availability_windows"."end_minute" BETWEEN 0 AND 1440),
	CONSTRAINT "availability_windows_end_after_start" CHECK ("availability_windows"."end_minute" > "availability_windows"."start_minute")
);
--> statement-breakpoint
ALTER TABLE "mentor_profiles" ADD COLUMN "access_mode" "mentor_access_mode" DEFAULT 'OPEN' NOT NULL;--> statement-breakpoint
ALTER TABLE "availability_windows" ADD CONSTRAINT "availability_windows_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "availability_windows_user_context_idx" ON "availability_windows" USING btree ("user_id","context");--> statement-breakpoint
-- Hand-written (design D1): the application role grant. A table without a grant
-- is the Sprint 1 audit finding; `mentor_profiles` was granted by `0003`.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "availability_windows" TO connect_app;
