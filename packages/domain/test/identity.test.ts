import assert from "node:assert/strict";
import { test } from "node:test";

import {
  IdentityError,
  requiresMfa,
  ROLES,
  type AccountSummary,
  type IdentityService,
  type Role,
  type SessionSummary,
  type SignInResult,
} from "../src/index.js";

/**
 * The seam is useful only if a second implementation compiles and runs against
 * the same interface (spec: "Implementation is replaceable").
 */
class FakeIdentityService implements IdentityService {
  async register(): Promise<{ status: "VERIFICATION_SENT" }> {
    return { status: "VERIFICATION_SENT" };
  }

  async verifyEmail(): Promise<void> {}

  async signIn(): Promise<SignInResult> {
    throw new IdentityError("INVALID_CREDENTIALS", "invalid email or password");
  }

  async signOut(): Promise<void> {}

  async signOutEverywhere(): Promise<void> {}

  async requestPasswordReset(): Promise<void> {}

  async resetPassword(): Promise<void> {}

  async getSession(): Promise<AccountSummary | null> {
    return null;
  }

  async activateAccount(): Promise<AccountSummary> {
    return {
      id: "user-1",
      displayName: "Fake",
      email: "fake@example.com",
      emailVerified: true,
      timezone: "Asia/Dhaka",
      accountStatus: "ACTIVE",
      mfaEnabled: false,
    };
  }

  async suspendAccount(): Promise<AccountSummary> {
    throw new IdentityError("ACCOUNT_SUSPENDED", "the account is suspended");
  }

  async deactivateAccount(): Promise<void> {}

  async enrollMfa(): Promise<{ totpUri: string; backupCodes: string[] }> {
    throw new IdentityError("VALIDATION_ERROR", "not implemented in the fake");
  }

  async verifyMfa(): Promise<{ sessionToken: string; account: AccountSummary }> {
    throw new IdentityError("INVALID_CREDENTIALS", "not implemented in the fake");
  }

  async disableMfa(): Promise<{ sessionToken: string }> {
    throw new IdentityError("VALIDATION_ERROR", "not implemented in the fake");
  }

  async listSessions(): Promise<SessionSummary[]> {
    return [];
  }

  async revokeSession(): Promise<void> {}

  async listRoles(): Promise<Role[]> {
    return ["STUDENT"];
  }

  async grantRole(): Promise<Role[]> {
    return ["STUDENT", "MENTOR"];
  }

  async startProviderSignIn(): Promise<{ authorizationUrl: string; stateCookie: string }> {
    throw new IdentityError("PROVIDER_UNAVAILABLE", "not configured in the fake");
  }

  async completeProviderSignIn(): Promise<SignInResult> {
    throw new IdentityError("INVALID_CREDENTIALS", "not implemented in the fake");
  }
}

test("a second implementation satisfies the identity interface", async () => {
  const service: IdentityService = new FakeIdentityService();

  const result = await service.register({
    displayName: "রহিম উদ্দিন",
    email: "fake@example.com",
    password: "a sufficiently long passphrase",
    dateOfBirth: "2000-01-01",
    consentAccepted: true,
    requestId: "req-1",
  });

  assert.deepEqual(result, { status: "VERIFICATION_SENT" });
  await assert.rejects(service.signIn({ email: "fake@example.com", password: "x", requestId: "req-2" }), {
    name: "IdentityError",
    code: "INVALID_CREDENTIALS",
  });
  assert.equal(await service.getSession({ sessionToken: "token" }), null);
});

test("the second-factor policy answers for each of the five roles", () => {
  assert.deepEqual(
    ROLES.map((role) => [role, requiresMfa(role)]),
    [
      ["STUDENT", false],
      ["MENTOR", true],
      ["INSTITUTION_ADMIN", true],
      ["PLATFORM_ADMIN", true],
      ["EMPLOYER", false],
    ],
  );
});

test("a role denial is its own error code, not the sign-in refusal", () => {
  assert.equal(new IdentityError("ROLE_REQUIRED", "needs the mentor role").code, "ROLE_REQUIRED");
  assert.equal(new IdentityError("MFA_REQUIRED", "needs a factor").code, "MFA_REQUIRED");
});
