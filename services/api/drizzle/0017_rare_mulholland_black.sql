CREATE TYPE "public"."report_kind" AS ENUM('USER', 'MESSAGE', 'PROFILE', 'OUTCOME');--> statement-breakpoint
CREATE TYPE "public"."report_status" AS ENUM('OPEN', 'RESOLVED', 'DISMISSED');--> statement-breakpoint
CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reporter_user_id" text NOT NULL,
	"target_kind" "report_kind" NOT NULL,
	"target_id" text NOT NULL,
	"reason" text NOT NULL,
	"details" text,
	"status" "report_status" DEFAULT 'OPEN' NOT NULL,
	"decision" text,
	"resolution_reason" text,
	"resolved_by_user_id" text,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reports_reason_known" CHECK ("reports"."reason" IN ('HARASSMENT', 'SPAM', 'IMPERSONATION', 'MISREPRESENTATION', 'OTHER')),
	CONSTRAINT "reports_details_bounds" CHECK ("reports"."details" IS NULL OR length("reports"."details") BETWEEN 1 AND 2000),
	CONSTRAINT "reports_decision_known" CHECK ("reports"."decision" IS NULL OR "reports"."decision" IN ('ACTIONED', 'DISMISSED')),
	CONSTRAINT "reports_resolution_complete" CHECK ("reports"."status" = 'OPEN' OR ("reports"."decision" IS NOT NULL AND "reports"."resolved_by_user_id" IS NOT NULL AND "reports"."resolved_at" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "suspended_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporter_user_id_users_id_fk" FOREIGN KEY ("reporter_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_resolved_by_user_id_users_id_fk" FOREIGN KEY ("resolved_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reports_status_idx" ON "reports" USING btree ("status","created_at");--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "reports" TO connect_app;
