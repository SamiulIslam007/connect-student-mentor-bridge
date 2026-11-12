import { Body, Controller, Get, HttpCode, Inject, Post, Query, Req } from "@nestjs/common";

import { Throttle } from "@nestjs/throttler";

import { RATE_LIMITS } from "@connect/config";
import { IdentityError, type IdentityService } from "@connect/domain";

import { bearerToken, optionalBearerToken } from "../http/bearer.js";
import type { RequestWithId } from "../http/request-id.middleware.js";
import { IDENTITY_SERVICE } from "./identity.tokens.js";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * The library rejects an address the API lets through with a `500`, so the shape
 * check here is deliberately stricter than the old regex: no whitespace, one
 * `@`, no empty label, no leading/trailing dot, and no consecutive dots.
 */
function isValidEmailShape(value: string): boolean {
  if (/\s/.test(value) || value.includes("..")) {
    return false;
  }
  const parts = value.split("@");
  if (parts.length !== 2) {
    return false;
  }
  const [local, domain] = parts;
  if (!local || !domain || local.startsWith(".") || local.endsWith(".")) {
    return false;
  }
  if (domain.startsWith(".") || domain.endsWith(".") || !domain.includes(".")) {
    return false;
  }
  return EMAIL_PATTERN.test(value);
}

function bodyRecord(body: unknown): Record<string, unknown> {
  return typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
}

function textField(body: unknown, field: string): string {
  const value = bodyRecord(body)[field];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new IdentityError("VALIDATION_ERROR", `${field} is required`);
  }
  return value;
}

function optionalTextField(body: unknown, field: string): string | undefined {
  const value = bodyRecord(body)[field];
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function emailField(body: unknown): string {
  const value = textField(body, "email").trim().toLowerCase();
  if (!isValidEmailShape(value)) {
    throw new IdentityError("VALIDATION_ERROR", "email must be a valid email address");
  }
  return value;
}

/**
 * `POST /v1/auth/*` (docs/api-contracts.md section 4.1). The browser reaches
 * these paths only through the Next.js backend-for-frontend, which keeps the
 * session token in an httpOnly cookie (design D11).
 */
@Controller("v1/auth")
export class AuthController {
  constructor(@Inject(IDENTITY_SERVICE) private readonly identity: IdentityService) {}

  @Throttle({ default: RATE_LIMITS.register })
  @Post("register")
  @HttpCode(200)
  async register(@Body() body: unknown, @Req() request: RequestWithId): Promise<{ status: string }> {
    // Acceptance is the trust boundary, so it is read before any other field:
    // no user, session, or consent row is written without it (D-82).
    const consentAccepted = bodyRecord(body).consent_accepted === true;
    if (!consentAccepted) {
      throw new IdentityError("VALIDATION_ERROR", "consent_accepted must be true");
    }
    const result = await this.identity.register({
      displayName: textField(body, "display_name"),
      email: emailField(body),
      password: textField(body, "password"),
      dateOfBirth: textField(body, "date_of_birth"),
      consentAccepted,
      timezone: optionalTextField(body, "timezone"),
      requestId: request.requestId,
    });
    return { status: result.status.toLowerCase() };
  }

  @Get("verify")
  async verify(
    @Query("token") token: string | undefined,
    @Req() request: RequestWithId,
  ): Promise<{ status: string }> {
    if (!token) {
      throw new IdentityError("VALIDATION_ERROR", "token is required");
    }
    await this.identity.verifyEmail({ token, requestId: request.requestId });
    return { status: "verified" };
  }

  @Throttle({ default: RATE_LIMITS.auth })
  @Throttle({
    account: { limit: RATE_LIMITS.accountAuth.limit, ttl: RATE_LIMITS.accountAuth.ttl },
  })
  @Post("sign-in")
  @HttpCode(200)
  async signIn(@Body() body: unknown, @Req() request: RequestWithId) {
    const result = await this.identity.signIn({
      email: emailField(body),
      password: textField(body, "password"),
      requestId: request.requestId,
    });
    // A withheld session is not a failure: the caller now owes a second factor
    // (spec: "Sign-in returns a challenge, not a session").
    if (result.mfaRequired) {
      return { mfa_required: true, mfa_challenge: result.mfaChallenge };
    }
    return {
      mfa_required: false,
      session_token: result.sessionToken,
      account: {
        id: result.account.id,
        display_name: result.account.displayName,
        email: result.account.email,
        email_verified: result.account.emailVerified,
        // The client never has to guess the status (spec: "Sign-in reports the status").
        account_status: result.account.accountStatus.toLowerCase(),
        timezone: result.account.timezone,
      },
    };
  }

  @Post("mfa/enroll")
  @HttpCode(200)
  async enrollMfa(@Body() body: unknown, @Req() request: RequestWithId) {
    const enrollment = await this.identity.enrollMfa({
      sessionToken: bearerToken(request),
      password: textField(body, "password"),
      requestId: request.requestId,
    });
    return { totp_uri: enrollment.totpUri, backup_codes: enrollment.backupCodes };
  }

  @Post("mfa/verify")
  @HttpCode(200)
  async verifyMfa(@Body() body: unknown, @Req() request: RequestWithId) {
    const method = optionalTextField(body, "method") === "backup_code" ? "backup_code" : "totp";
    const verification = await this.identity.verifyMfa({
      code: textField(body, "code"),
      mfaChallenge: optionalTextField(body, "mfa_challenge"),
      sessionToken: optionalBearerToken(request),
      method,
      requestId: request.requestId,
    });
    return {
      session_token: verification.sessionToken,
      account_status: verification.account.accountStatus.toLowerCase(),
    };
  }

  @Post("mfa/disable")
  @HttpCode(200)
  async disableMfa(@Body() body: unknown, @Req() request: RequestWithId) {
    const result = await this.identity.disableMfa({
      sessionToken: bearerToken(request),
      password: textField(body, "password"),
      requestId: request.requestId,
    });
    // Removing the factor rotated the session; the client must adopt the new one.
    return { status: "disabled", session_token: result.sessionToken };
  }

  @Post("sign-in/provider")
  @HttpCode(200)
  async startProviderSignIn(@Body() body: unknown, @Req() request: RequestWithId) {
    const started = await this.identity.startProviderSignIn({
      provider: textField(body, "provider"),
      callbackUrl: textField(body, "callback_url"),
      requestId: request.requestId,
    });
    return { authorization_url: started.authorizationUrl, state_cookie: started.stateCookie };
  }

  @Post("provider/callback")
  @HttpCode(200)
  async completeProviderSignIn(@Body() body: unknown, @Req() request: RequestWithId) {
    const result = await this.identity.completeProviderSignIn({
      provider: textField(body, "provider"),
      code: textField(body, "code"),
      state: textField(body, "state"),
      stateCookie: textField(body, "state_cookie"),
      requestId: request.requestId,
    });
    if (result.mfaRequired) {
      return { mfa_required: true, mfa_challenge: result.mfaChallenge };
    }
    return {
      mfa_required: false,
      session_token: result.sessionToken,
      account: {
        id: result.account.id,
        display_name: result.account.displayName,
        email: result.account.email,
        email_verified: result.account.emailVerified,
        account_status: result.account.accountStatus.toLowerCase(),
        timezone: result.account.timezone,
      },
    };
  }

  @Post("sign-out")
  @HttpCode(200)
  async signOut(@Req() request: RequestWithId): Promise<{ status: string }> {
    await this.identity.signOut({
      sessionToken: bearerToken(request),
      requestId: request.requestId,
    });
    return { status: "signed_out" };
  }

  @Post("sign-out-everywhere")
  @HttpCode(200)
  async signOutEverywhere(@Req() request: RequestWithId): Promise<{ status: string }> {
    await this.identity.signOutEverywhere({
      sessionToken: bearerToken(request),
      requestId: request.requestId,
    });
    return { status: "signed_out_everywhere" };
  }

  @Throttle({ default: RATE_LIMITS.reset })
  @Throttle({
    account: { limit: RATE_LIMITS.accountReset.limit, ttl: RATE_LIMITS.accountReset.ttl },
  })
  @Post("forgot-password")
  @HttpCode(200)
  async forgotPassword(
    @Body() body: unknown,
    @Req() request: RequestWithId,
  ): Promise<{ status: string }> {
    await this.identity.requestPasswordReset({
      email: emailField(body),
      requestId: request.requestId,
    });
    return { status: "reset_email_sent_if_account_exists" };
  }

  @Throttle({ default: RATE_LIMITS.reset })
  @Throttle({
    account: { limit: RATE_LIMITS.accountReset.limit, ttl: RATE_LIMITS.accountReset.ttl },
  })
  @Post("reset-password")
  @HttpCode(200)
  async resetPassword(@Body() body: unknown, @Req() request: RequestWithId): Promise<{ status: string }> {
    const token = optionalTextField(body, "token");
    if (!token) {
      throw new IdentityError("VALIDATION_ERROR", "token is required");
    }
    await this.identity.resetPassword({
      token,
      password: textField(body, "new_password"),
      requestId: request.requestId,
    });
    return { status: "password_reset" };
  }
}
