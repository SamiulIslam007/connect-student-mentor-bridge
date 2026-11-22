/**
 * The production secret guard (SEC-AUDIT-012, D-261). A deployed API must not
 * boot with an empty secret or with a value that exists in `.env.example`; the
 * error names the variable and never prints the value.
 */
export const DEVELOPMENT_PLACEHOLDERS = [
  "local-dev-only",
  "test-bff-secret",
  "change-me",
  "changeme",
] as const;

const REQUIRED = ["BETTER_AUTH_SECRET", "BFF_TRUST_SECRET", "DATABASE_URL"] as const;
const OPTIONAL_WITH_SECRET = [
  ["S3_SECRET_ACCESS_KEY", "S3_ACCESS_KEY_ID"],
  ["SMTP_PASSWORD", "SMTP_USER"],
  ["GOOGLE_CLIENT_SECRET", "GOOGLE_CLIENT_ID"],
] as const;

function isPlaceholder(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (normalized.length === 0) {
    return true;
  }
  return DEVELOPMENT_PLACEHOLDERS.some((placeholder) => normalized.includes(placeholder));
}

/**
 * The variable names that must be replaced before a production boot. Empty is a
 * violation for a required variable and for a pair whose partner is set.
 */
export function productionSecretViolations(
  environment: NodeJS.ProcessEnv = process.env,
): string[] {
  if (environment.NODE_ENV !== "production") {
    return [];
  }
  const violations: string[] = [];
  for (const name of REQUIRED) {
    if (isPlaceholder(environment[name] ?? "")) {
      violations.push(name);
    }
  }
  for (const [secret, partner] of OPTIONAL_WITH_SECRET) {
    const value = environment[secret];
    const partnerSet = Boolean((environment[partner] ?? "").trim());
    if (value !== undefined && (isPlaceholder(value) || !partnerSet)) {
      violations.push(secret);
    }
  }
  return violations;
}

/** Fail the boot, naming the variables and nothing else. */
export function assertProductionSecrets(environment: NodeJS.ProcessEnv = process.env): void {
  const violations = productionSecretViolations(environment);
  if (violations.length === 0) {
    return;
  }
  throw new Error(
    `production secrets are missing or still development placeholders: ${violations.join(", ")}`,
  );
}
