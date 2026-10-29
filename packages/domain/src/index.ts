/**
 * Placeholder for pure business rules (match score, reputation, revenue math).
 * Business logic lands here in later changes; no framework, database, or HTTP
 * import is allowed in this package.
 */
export const DOMAIN_PACKAGE_NAME = "@connect/domain";

export function describeDomain(): string {
  return `${DOMAIN_PACKAGE_NAME} holds pure business rules only.`;
}
