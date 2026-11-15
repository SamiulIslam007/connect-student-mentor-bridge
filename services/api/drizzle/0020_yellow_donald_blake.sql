CREATE TABLE "thread_read_states" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mentorship_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"last_read_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "thread_read_states" ADD CONSTRAINT "thread_read_states_mentorship_id_mentorships_id_fk" FOREIGN KEY ("mentorship_id") REFERENCES "public"."mentorships"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "thread_read_states" ADD CONSTRAINT "thread_read_states_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "thread_read_states_pair_unique" ON "thread_read_states" USING btree ("mentorship_id","user_id");--> statement-breakpoint
CREATE INDEX "thread_read_states_user_idx" ON "thread_read_states" USING btree ("user_id","mentorship_id");
--> statement-breakpoint
-- Hand-written grants (design R6, docs/data-model.md INV-05).
-- Exactly SELECT, INSERT, UPDATE: a marker row is removed only by the
-- mentorship cascade, so the application role never needs DELETE.
GRANT SELECT, INSERT, UPDATE
  ON TABLE "thread_read_states"
  TO connect_app;
