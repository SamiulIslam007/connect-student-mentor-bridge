CREATE TYPE "public"."affiliation_kind" AS ENUM('ALUMNUS', 'STUDENT', 'FACULTY_STAFF', 'EMPLOYEE');--> statement-breakpoint
CREATE TYPE "public"."affiliation_level" AS ENUM('LEVEL_0', 'LEVEL_1', 'LEVEL_2');--> statement-breakpoint
CREATE TYPE "public"."affiliation_method" AS ENUM('INSTITUTIONAL_EMAIL', 'ADMIN_ATTESTATION', 'EMPLOYER_EMAIL', 'PROFESSIONAL_LINK');--> statement-breakpoint
CREATE TYPE "public"."affiliation_status" AS ENUM('PENDING', 'VERIFIED', 'REJECTED', 'REVOKED', 'EXPIRED');--> statement-breakpoint
CREATE TYPE "public"."mentor_onboarding_status" AS ENUM('APPLIED', 'EMAIL_VERIFIED', 'AFFILIATION_VERIFIED', 'EMPLOYER_CHECKED');--> statement-breakpoint
CREATE TABLE "affiliations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"institution_id" uuid,
	"organization_name" text,
	"organization_domain" "citext",
	"kind" "affiliation_kind" NOT NULL,
	"department" text,
	"program" text,
	"batch_year" smallint,
	"level" "affiliation_level" NOT NULL,
	"method" "affiliation_method" NOT NULL,
	"status" "affiliation_status" NOT NULL,
	"decided_by_user_id" text,
	"decision_reason" text,
	"verified_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "affiliations_institution_or_organization" CHECK ("affiliations"."institution_id" IS NOT NULL OR "affiliations"."organization_name" IS NOT NULL),
	CONSTRAINT "affiliations_batch_year_range" CHECK ("affiliations"."batch_year" IS NULL OR "affiliations"."batch_year" BETWEEN 1900 AND 2200)
);
--> statement-breakpoint
ALTER TABLE "mentor_profiles" ADD COLUMN "onboarding_status" "mentor_onboarding_status" DEFAULT 'APPLIED' NOT NULL;--> statement-breakpoint
ALTER TABLE "mentor_profiles" ADD COLUMN "activated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "affiliations" ADD CONSTRAINT "affiliations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliations" ADD CONSTRAINT "affiliations_institution_id_institutions_id_fk" FOREIGN KEY ("institution_id") REFERENCES "public"."institutions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "affiliations" ADD CONSTRAINT "affiliations_decided_by_user_id_users_id_fk" FOREIGN KEY ("decided_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "affiliations_one_verified_unique" ON "affiliations" USING btree ("user_id") WHERE "affiliations"."status" = 'VERIFIED';--> statement-breakpoint
CREATE INDEX "affiliations_user_id_idx" ON "affiliations" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "affiliations_institution_id_idx" ON "affiliations" USING btree ("institution_id");--> statement-breakpoint
-- Hand-written (design D1): the application role grant. `mentor_profiles` was
-- granted by `0003`, and the two added columns inherit that grant.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "affiliations" TO connect_app;