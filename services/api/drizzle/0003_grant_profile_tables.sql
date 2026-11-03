-- Hand-written grants (design D1, docs/data-model.md INV-05).
-- Migration `0002` added the profile tables without granting the application
-- role, so `connect_app` could not read or write them. Forward-only and
-- idempotent: re-granting the same privileges is a no-op.
-- Exactly these five tables and exactly SELECT, INSERT, UPDATE, DELETE.
-- The append-only tables (`consent_records`, `audit_logs`) keep their
-- SELECT/INSERT-only grant from `0000`; a future table adds its own grant.
GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE "fields", "student_profiles", "student_field_interests",
             "mentor_profiles", "mentor_fields"
  TO connect_app;
