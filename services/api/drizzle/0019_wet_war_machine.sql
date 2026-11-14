ALTER TABLE "mentorship_requests" ADD COLUMN "expiry_reason" text;--> statement-breakpoint
ALTER TABLE "mentorship_requests" ADD CONSTRAINT "mentorship_requests_expiry_reason_known" CHECK ("mentorship_requests"."expiry_reason" is null or "mentorship_requests"."expiry_reason" in ('DEADLINE', 'MENTOR_INELIGIBLE'));
--> statement-breakpoint
UPDATE "mentorship_requests" SET "expiry_reason" = 'DEADLINE' WHERE "status" = 'EXPIRED';
