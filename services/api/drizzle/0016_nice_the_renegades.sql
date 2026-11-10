CREATE TYPE "public"."privacy_request_kind" AS ENUM('EXPORT', 'DELETE');--> statement-breakpoint
CREATE TYPE "public"."privacy_request_status" AS ENUM('COMPLETED', 'FAILED');--> statement-breakpoint
CREATE TABLE "privacy_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"kind" "privacy_request_kind" NOT NULL,
	"status" "privacy_request_status" DEFAULT 'COMPLETED' NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "privacy_requests" ADD CONSTRAINT "privacy_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "privacy_requests_user_kind_idx" ON "privacy_requests" USING btree ("user_id","kind","requested_at");--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "privacy_requests" TO connect_app;
