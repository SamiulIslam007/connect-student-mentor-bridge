/**
 * Shared constants used by more than one workspace member. Values that can
 * differ per environment belong in the environment, not here.
 */
export const APP_NAME = "connect";

/**
 * The version of the terms of service and privacy notice shown at registration
 * and rendered by `/terms` and `/privacy` (D-82). Stored on every consent
 * record, so a text change bumps this one value.
 */
export const CONSENT_DOCUMENT_VERSION = "2026-11";


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

/**
 * Matching weights (`docs/matching-algorithm-spec.md` §6, D-91): three of the
 * four documented factors. GoalAlignment ships at 25 but is permanently
 * missing, because neither side stores a structured goal type; the
 * missing-factor rule renormalizes the rest (§6.3). Changing a weight is a
 * one-line edit, no migration.
 */
export const MATCH_FACTOR_WEIGHTS = {
  alumni: 30,
  field: 30,
  goal: 25,
  availability: 15,
} as const;

/**
 * MATH-FLAG (D-95): the spec says the alumni batch band is a config value but
 * never states it. 0 means "the same batch year counts as close", the most
 * conservative reading. The owner confirms the number; raising it changes this
 * constant and one test expectation.
 */
export const MATCH_ALUMNI_BATCH_DISTANCE = 0;

/**
 * Impact reliability: below this many requests the own-impact view shows a
 * single "not enough data yet" line instead of the two counts (D-117). A
 * **Proposed default** pending pilot traffic.
 */
export const IMPACT_RELIABILITY_MIN_SAMPLE = 3;

/**
 * Rate-limit starting values, **placeholders pending pilot traffic**
 * (`docs/api-contracts.md` §9 keeps the concrete values Open as SEC-O2). They
 * are configuration, so tuning needs no code change. `ttl` is milliseconds,
 * the unit `@nestjs/throttler` expects.
 */
export const RATE_LIMITS = {
  /** Sign-in: credential guessing. */
  auth: { limit: 5, ttl: 60_000 },
  /** Registration: account and email flooding. */
  register: { limit: 3, ttl: 3_600_000 },
  /** Forgot/reset password: reset-mail flooding. */
  reset: { limit: 3, ttl: 3_600_000 },
  /**
   * Data export: a bulk read of almost every table for one user. A starting
   * value pending pilot traffic (`docs/api-contracts.md` §9 keeps it Open as
   * SEC-O2).
   */
  export: { limit: 3, ttl: 3_600_000 },
  /** Writes that enqueue email or append ledger rows. */
  write: { limit: 60, ttl: 60_000 },
  /** Every other route, including the public directory. */
  default: { limit: 120, ttl: 60_000 },
  /**
   * Per-account sign-in, hourly: one account tried from many addresses
   * (`DEBT-27`, D-118). A person never reaches it; a dictionary run does.
   */
  accountAuth: { limit: 10, ttl: 3_600_000 },
  /** Per-account password reset and forgot-password, hourly (D-118). */
  accountReset: { limit: 5, ttl: 3_600_000 },
  /**
   * The module-level account bucket. Deliberately the same order as `default`,
   * so registering the throttler changes no route's behaviour (R1).
   */
  accountDefault: { limit: 120, ttl: 60_000 },
} as const;
