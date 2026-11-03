export interface IdentityConfig {
  secret: string;
  baseUrl: string;
}

/** Fail loudly at boot when the auth configuration is missing or too weak. */
export function readIdentityConfig(environment: NodeJS.ProcessEnv = process.env): IdentityConfig {
  const secret = environment.BETTER_AUTH_SECRET ?? "";
  if (secret.length < 32) {
    throw new Error("BETTER_AUTH_SECRET must be set to at least 32 characters");
  }

  const configuredBaseUrl = environment.BETTER_AUTH_URL;
  if (!configuredBaseUrl && environment.NODE_ENV === "production") {
    // A wrong origin puts dead localhost links in verification and reset emails.
    throw new Error("BETTER_AUTH_URL must be set outside development");
  }

  return {
    secret,
    baseUrl: configuredBaseUrl ?? "http://localhost:3000",
  };
}
