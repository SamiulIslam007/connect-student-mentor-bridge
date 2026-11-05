CREATE TYPE "public"."role" AS ENUM('STUDENT', 'MENTOR', 'INSTITUTION_ADMIN', 'PLATFORM_ADMIN', 'EMPLOYER');--> statement-breakpoint
CREATE TABLE "role_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"role" "role" NOT NULL,
	"institution_id" uuid,
	"granted_by_user_id" text,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "role_assignments_institution_required" CHECK ("role_assignments"."role" <> 'INSTITUTION_ADMIN' OR "role_assignments"."institution_id" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "role_assignments" ADD CONSTRAINT "role_assignments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_assignments" ADD CONSTRAINT "role_assignments_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_assignments" ADD CONSTRAINT "role_assignments_granted_by_user_id_users_id_fk" FOREIGN KEY ("granted_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "role_assignments_active_unique" ON "role_assignments" USING btree ("user_id","role",COALESCE("institution_id", '00000000-0000-0000-0000-000000000000'::uuid)) WHERE "role_assignments"."revoked_at" IS NULL;--> statement-breakpoint
CREATE INDEX "role_assignments_user_id_idx" ON "role_assignments" USING btree ("user_id");--> statement-breakpoint
-- Hand-written (design D1/D2): a table without a grant is the Sprint 1 audit
-- finding, and every pre-existing account gets its default role plus one audit
-- row, so the backfill does not repeat DEBT-10 (a backfill with no trail).
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "role_assignments" TO connect_app;--> statement-breakpoint
WITH granted AS (
  INSERT INTO "role_assignments" ("user_id", "role")
  SELECT "id", 'STUDENT' FROM "users"
  ON CONFLICT DO NOTHING
  RETURNING "id"
)
INSERT INTO "audit_logs" ("actor_user_id", "actor_role", "action", "object_type", "object_id", "request_id", "reason", "metadata")
SELECT NULL, 'SYSTEM', 'ROLE_GRANTED', 'role_assignments', granted."id", 'migration-0007',
  'migration 0007 backfill: default STUDENT role for pre-existing accounts',
  jsonb_build_object('role', 'STUDENT')
FROM granted;
