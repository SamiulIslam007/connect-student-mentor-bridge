-- Data migration only: no schema change (design D9, D-32).
--
-- Before this change, email verification never moved the account status, so an
-- account could be verified and still `PENDING`. Activation now happens on
-- verification, which would leave those accounts unable to sign in. Backfill
-- them to the state the previous code assumed. Forward-only and idempotent.
UPDATE "users" SET "status" = 'ACTIVE' WHERE "status" = 'PENDING' AND "email_verified" = true;
