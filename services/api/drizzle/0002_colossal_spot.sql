CREATE TYPE "public"."field_status" AS ENUM('ACTIVE', 'RETIRED');--> statement-breakpoint
CREATE TYPE "public"."mentor_status" AS ENUM('DRAFT', 'PENDING', 'ACTIVE', 'SUSPENDED', 'REMOVED');--> statement-breakpoint
CREATE TABLE "fields" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"normalized_slug" "citext" NOT NULL,
	"created_by_user_id" text,
	"status" "field_status" DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mentor_fields" (
	"mentor_profile_id" uuid NOT NULL,
	"field_id" uuid NOT NULL,
	CONSTRAINT "mentor_fields_mentor_profile_id_field_id_pk" PRIMARY KEY("mentor_profile_id","field_id")
);
--> statement-breakpoint
CREATE TABLE "mentor_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"primary_field_id" uuid NOT NULL,
	"status" "mentor_status" DEFAULT 'DRAFT' NOT NULL,
	"headline" text NOT NULL,
	"bio" text NOT NULL,
	"expertise_summary" text NOT NULL,
	"scope_statement" text NOT NULL,
	"languages" text[] DEFAULT '{}'::text[] NOT NULL,
	"weekly_capacity" smallint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mentor_profiles_weekly_capacity_min" CHECK ("mentor_profiles"."weekly_capacity" >= 1)
);
--> statement-breakpoint
CREATE TABLE "student_field_interests" (
	"student_profile_id" uuid NOT NULL,
	"field_id" uuid NOT NULL,
	CONSTRAINT "student_field_interests_student_profile_id_field_id_pk" PRIMARY KEY("student_profile_id","field_id")
);
--> statement-breakpoint
CREATE TABLE "student_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"goals" text NOT NULL,
	"primary_field_id" uuid NOT NULL,
	"languages" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "fields" ADD CONSTRAINT "fields_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentor_fields" ADD CONSTRAINT "mentor_fields_mentor_profile_id_mentor_profiles_id_fk" FOREIGN KEY ("mentor_profile_id") REFERENCES "public"."mentor_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentor_fields" ADD CONSTRAINT "mentor_fields_field_id_fields_id_fk" FOREIGN KEY ("field_id") REFERENCES "public"."fields"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentor_profiles" ADD CONSTRAINT "mentor_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentor_profiles" ADD CONSTRAINT "mentor_profiles_primary_field_id_fields_id_fk" FOREIGN KEY ("primary_field_id") REFERENCES "public"."fields"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_field_interests" ADD CONSTRAINT "student_field_interests_student_profile_id_student_profiles_id_fk" FOREIGN KEY ("student_profile_id") REFERENCES "public"."student_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_field_interests" ADD CONSTRAINT "student_field_interests_field_id_fields_id_fk" FOREIGN KEY ("field_id") REFERENCES "public"."fields"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_profiles" ADD CONSTRAINT "student_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_profiles" ADD CONSTRAINT "student_profiles_primary_field_id_fields_id_fk" FOREIGN KEY ("primary_field_id") REFERENCES "public"."fields"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "fields_normalized_slug_unique" ON "fields" USING btree ("normalized_slug");--> statement-breakpoint
CREATE UNIQUE INDEX "mentor_profiles_user_id_unique" ON "mentor_profiles" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "student_profiles_user_id_unique" ON "student_profiles" USING btree ("user_id");