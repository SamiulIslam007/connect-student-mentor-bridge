import assert from "node:assert/strict";
import { test } from "node:test";

import {
  IdentityError,
  type AccountSummary,
  type IdentityService,
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

  async signIn(): Promise<{ sessionToken: string; account: AccountSummary }> {
    throw new IdentityError("INVALID_CREDENTIALS", "invalid email or password");
  }

  async signOut(): Promise<void> {}

  async signOutEverywhere(): Promise<void> {}

  async requestPasswordReset(): Promise<void> {}

  async resetPassword(): Promise<void> {}

  async getSession(): Promise<AccountSummary | null> {
    return null;
  }
}

test("a second implementation satisfies the identity interface", async () => {
  const service: IdentityService = new FakeIdentityService();

  const result = await service.register({
    displayName: "রহিম উদ্দিন",
    email: "fake@example.com",
    password: "a sufficiently long passphrase",
    dateOfBirth: "2000-01-01",
    requestId: "req-1",
  });

  assert.deepEqual(result, { status: "VERIFICATION_SENT" });
  await assert.rejects(service.signIn({ email: "fake@example.com", password: "x", requestId: "req-2" }), {
    name: "IdentityError",
    code: "INVALID_CREDENTIALS",
  });
  assert.equal(await service.getSession({ sessionToken: "token" }), null);
});
