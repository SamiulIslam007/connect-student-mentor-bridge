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

  return {
    secret,
    baseUrl: environment.BETTER_AUTH_URL ?? "http://localhost:3000",
  };
}
