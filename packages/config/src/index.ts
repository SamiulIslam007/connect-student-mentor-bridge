/**
 * Shared constants used by more than one workspace member. Values that can
 * differ per environment belong in the environment, not here.
 */
export const APP_NAME = "connect";

export const API_SERVICE_NAME = "api";

/** Proposed default from design.md D5: bounded dependency checks. */
export const READINESS_TIMEOUT_MS = 2_000;

/**
 * Proposed default, NOT a decided value (`docs/api-contracts.md` API-O7): the
 * cooling period between a mentor confirmation and counting. Read by
 * `outcomes-and-verification` only to write `cooling_ends_at`; the owner sets the
 * real number after the pilot.
 */
export const OUTCOME_COOLING_PERIOD_DAYS = 14;
