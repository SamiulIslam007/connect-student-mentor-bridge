CREATE TYPE "public"."evidence_scan_status" AS ENUM('QUARANTINED', 'CLEAN', 'REJECTED');--> statement-breakpoint
CREATE TABLE "outcome_evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"outcome_id" uuid NOT NULL,
	"uploaded_by_user_id" text NOT NULL,
	"object_key" text NOT NULL,
	"sha256" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"content_type" text NOT NULL,
	"status" "evidence_scan_status" DEFAULT 'QUARANTINED' NOT NULL,
	"scanned_at" timestamp with time zone,
	"scan_detail" text,
	"uploaded_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "outcome_evidence_sha256_shape" CHECK ("outcome_evidence"."sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "outcome_evidence_size_bounds" CHECK ("outcome_evidence"."size_bytes" BETWEEN 1 AND 5242880),
	CONSTRAINT "outcome_evidence_content_type_known" CHECK ("outcome_evidence"."content_type" IN ('application/pdf', 'image/png', 'image/jpeg'))
);
--> statement-breakpoint
ALTER TABLE "outcome_evidence" ADD CONSTRAINT "outcome_evidence_outcome_id_outcomes_id_fk" FOREIGN KEY ("outcome_id") REFERENCES "public"."outcomes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outcome_evidence" ADD CONSTRAINT "outcome_evidence_uploaded_by_user_id_users_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "outcome_evidence_object_key_unique" ON "outcome_evidence" USING btree ("object_key");--> statement-breakpoint
CREATE UNIQUE INDEX "outcome_evidence_outcome_unique" ON "outcome_evidence" USING btree ("outcome_id");--> statement-breakpoint
CREATE INDEX "outcome_evidence_pending_idx" ON "outcome_evidence" USING btree ("status") WHERE "outcome_evidence"."status" = 'QUARANTINED';
--> statement-breakpoint
-- Hand-written grants (design R4, docs/data-model.md). No DELETE: retention
-- marks `deleted_at` and deletes the object, never the row.
GRANT SELECT, INSERT, UPDATE
  ON TABLE "outcome_evidence"
  TO connect_app;
