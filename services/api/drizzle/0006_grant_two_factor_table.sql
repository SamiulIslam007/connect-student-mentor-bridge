-- Hand-written grants (design D6, docs/data-model.md INV-05).
-- Migration `0005` added `two_factors` without granting the application role,
-- which is the Sprint 1 audit finding. Forward-only and idempotent: re-granting
-- the same privileges is a no-op. Exactly SELECT, INSERT, UPDATE, DELETE — the
-- library deletes rows on disable, so grants narrower than this break it.
GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE "two_factors"
  TO connect_app;
