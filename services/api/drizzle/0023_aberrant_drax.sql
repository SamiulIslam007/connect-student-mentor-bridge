CREATE TABLE "idempotency_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" text NOT NULL,
	"operation" text NOT NULL,
	"key" text NOT NULL,
	"request_digest" text NOT NULL,
	"status" text DEFAULT 'IN_PROGRESS' NOT NULL,
	"response_status" integer,
	"response_body" jsonb,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "idempotency_keys_status_known" CHECK ("idempotency_keys"."status" in ('IN_PROGRESS', 'COMPLETED'))
);
--> statement-breakpoint
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idempotency_keys_scope_unique" ON "idempotency_keys" USING btree ("actor_user_id","operation","key");--> statement-breakpoint
CREATE INDEX "idempotency_keys_expires_idx" ON "idempotency_keys" USING btree ("expires_at");

--> statement-breakpoint
-- Hand-written grant (design R1, docs/data-model.md): the store is swept with a
-- DELETE, so this is the one new table the application role may delete from.
GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE "idempotency_keys"
  TO connect_app;
