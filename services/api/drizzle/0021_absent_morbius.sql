CREATE TABLE "config_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" integer NOT NULL,
	"payload" jsonb NOT NULL,
	"digest" text NOT NULL,
	"reason" text NOT NULL,
	"created_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "config_versions_reason_length" CHECK (char_length("config_versions"."reason") >= 1 AND char_length("config_versions"."reason") <= 1000),
	CONSTRAINT "config_versions_digest_hex" CHECK ("config_versions"."digest" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
ALTER TABLE "config_versions" ADD CONSTRAINT "config_versions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "config_versions_version_unique" ON "config_versions" USING btree ("version");--> statement-breakpoint
-- Version 1 is the baseline: it records the values in force before this change,
-- so the table is never empty and every historical ledger row has a version to
-- name (design R5). The digest is sha256 of the payload exactly as written here,
-- which is the same normalised JSON the service produces (design R3).
-- `created_by_user_id` is null for this one row: no account exists at migration time.
INSERT INTO "config_versions" ("version", "payload", "digest", "reason", "created_by_user_id")
VALUES (
	1,
	'{"cooling_days":14,"difficulty_weights":{"ADMISSION":1,"INTERNSHIP":1,"JOB_OFFER":1,"SKILL_MILESTONE":1,"INTERVIEW":1},"tier_multipliers":{"0":1,"1":1,"2":1},"contribution_multipliers":{"DIRECTLY_ENABLED":1,"HELPED":1,"MINOR":1},"audit_sample_rate":0.25}'::jsonb,
	'fc79f9c8987205e8c4688fd429b1673843c24a82e9b276e6e274e5675243a6af',
	'Baseline: the constants in force before configuration versioning',
	NULL
);
--> statement-breakpoint
ALTER TABLE "reputation_events" ADD COLUMN "config_version_id" uuid;--> statement-breakpoint
ALTER TABLE "reputation_events" ADD CONSTRAINT "reputation_events_config_version_id_config_versions_id_fk" FOREIGN KEY ("config_version_id") REFERENCES "public"."config_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
-- Historical rows were priced by exactly these values, so version 1 is a true
-- attribution, not a guess (design "Data risk").
UPDATE "reputation_events" SET "config_version_id" = (SELECT "id" FROM "config_versions" WHERE "version" = 1) WHERE "config_version_id" IS NULL;--> statement-breakpoint
ALTER TABLE "reputation_events" ALTER COLUMN "config_version_id" SET NOT NULL;
--> statement-breakpoint
-- Hand-written grants (D-184, docs/data-model.md INV-05): a stored version is
-- immutable for the application role, so exactly SELECT and INSERT. The
-- reputation ledger's own grant already covers its new column.
GRANT SELECT, INSERT
  ON TABLE "config_versions"
  TO connect_app;
