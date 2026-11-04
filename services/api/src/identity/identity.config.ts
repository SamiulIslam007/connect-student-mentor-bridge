export interface IdentityConfig {
  secret: string;
  baseUrl: string;
  /** Both set or both absent (design D3); never a placeholder. */
  google?: { clientId: string; clientSecret: string };
}

/** Fail loudly at boot when the auth configuration is missing or too weak. */
export function readIdentityConfig(environment: NodeJS.ProcessEnv = process.env): IdentityConfig {
  const secret = environment.BETTER_AUTH_SECRET ?? "";
  if (secret.length < 32) {
    throw new Error(
      "BETTER_AUTH_SECRET must be set to at least 32 characters (generate one with: openssl rand -base64 32)",
    );
  }

  const configuredBaseUrl = environment.BETTER_AUTH_URL;
  if (!configuredBaseUrl && environment.NODE_ENV === "production") {
    // A wrong origin puts dead localhost links in verification and reset emails.
    throw new Error("BETTER_AUTH_URL must be set outside development");
  }

  const googleClientId = environment.GOOGLE_CLIENT_ID?.trim() ?? "";
  const googleClientSecret = environment.GOOGLE_CLIENT_SECRET?.trim() ?? "";

  return {
    secret,
    baseUrl: configuredBaseUrl ?? "http://localhost:3000",
    // A half-configured provider is treated as unconfigured: registering it
    // would send users to Google with an empty secret.
    ...(googleClientId && googleClientSecret
      ? { google: { clientId: googleClientId, clientSecret: googleClientSecret } }
      : {}),
  };
}
