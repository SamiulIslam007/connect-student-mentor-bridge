/**
 * Placeholder for pure business rules (match score, reputation, revenue math).
 * Business logic lands here in later changes; no framework, database, or HTTP
 * import is allowed in this package.
 */
export const DOMAIN_PACKAGE_NAME = "@connect/domain";

export function describeDomain(): string {
  return `${DOMAIN_PACKAGE_NAME} holds pure business rules only.`;
}

export * from "./age-gate.js";
export * from "./affiliation.js";
export * from "./aggregates.js";
export * from "./audit-sample.js";
export * from "./account-status.js";
export * from "./config-payload.js";
export * from "./cursor.js";
export * from "./availability.js";
export * from "./evidence-retention.js";
export * from "./fields.js";
export * from "./observability-scrub.js";
export * from "./identity.js";
export * from "./idempotency.js";
export * from "./match.js";
export * from "./mentor-onboarding.js";
export * from "./mentorship.js";
export * from "./outcome.js";
export * from "./reputation.js";
export * from "./password-breach.js";
export * from "./password-policy.js";
export * from "./profiles.js";
export * from "./request.js";
export * from "./visibility.js";
