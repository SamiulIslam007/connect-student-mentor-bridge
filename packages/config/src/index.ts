/**
 * Shared constants used by more than one workspace member. Values that can
 * differ per environment belong in the environment, not here.
 */
export const APP_NAME = "connect";

export const API_SERVICE_NAME = "api";

/** Proposed default from design.md D5: bounded dependency checks. */
export const READINESS_TIMEOUT_MS = 2_000;
