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

/**
 * Reputation weights are **placeholders pending pilot data**: every value is
 * `1.0`, and `docs/reputation-and-verification-policy.md` §17 keeps the real
 * values Open. Points therefore reduce to the pair factor, and no numeric score
 * is exposed by any endpoint (D-67). Never read these as a ranking.
 */
const UNIFORM_PLACEHOLDER = 1.0;

export const REPUTATION_DIFFICULTY_WEIGHTS = {
  ADMISSION: UNIFORM_PLACEHOLDER,
  INTERNSHIP: UNIFORM_PLACEHOLDER,
  JOB_OFFER: UNIFORM_PLACEHOLDER,
  SKILL_MILESTONE: UNIFORM_PLACEHOLDER,
  INTERVIEW: UNIFORM_PLACEHOLDER,
} as const;

export const REPUTATION_TIER_MULTIPLIERS = {
  0: UNIFORM_PLACEHOLDER,
  1: UNIFORM_PLACEHOLDER,
  2: UNIFORM_PLACEHOLDER,
} as const;

export const REPUTATION_CONTRIBUTION_MULTIPLIERS = {
  DIRECTLY_ENABLED: UNIFORM_PLACEHOLDER,
  HELPED: UNIFORM_PLACEHOLDER,
  MINOR: UNIFORM_PLACEHOLDER,
} as const;
