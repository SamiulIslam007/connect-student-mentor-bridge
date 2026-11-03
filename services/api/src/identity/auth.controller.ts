import { Body, Controller, Get, HttpCode, Inject, Post, Query, Req } from "@nestjs/common";

import { IdentityError, type IdentityService } from "@connect/domain";

import type { RequestWithId } from "../http/request-id.middleware.js";
import { IDENTITY_SERVICE } from "./identity.tokens.js";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
  if (!EMAIL_PATTERN.test(value)) {
    throw new IdentityError("VALIDATION_ERROR", "email must be a valid email address");
  }
  return value;
}

function bearerToken(request: RequestWithId): string {
  const header = request.headers.authorization ?? "";
  const match = /^Bearer\s+(.+)$/.exec(header);
  if (!match || match[1].trim().length === 0) {
    throw new IdentityError("SESSION_INVALID", "a bearer session token is required");
  }
  return match[1].trim();
}

/**
 * `POST /v1/auth/*` (docs/api-contracts.md section 4.1). The browser reaches
 * these paths only through the Next.js backend-for-frontend, which keeps the
 * session token in an httpOnly cookie (design D11).
 */
@Controller("v1/auth")
export class AuthController {
  constructor(@Inject(IDENTITY_SERVICE) private readonly identity: IdentityService) {}

  @Post("register")
  @HttpCode(200)
  async register(@Body() body: unknown, @Req() request: RequestWithId): Promise<{ status: string }> {
    const result = await this.identity.register({
      displayName: textField(body, "display_name"),
      email: emailField(body),
      password: textField(body, "password"),
      dateOfBirth: textField(body, "date_of_birth"),
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

  @Post("sign-in")
  @HttpCode(200)
  async signIn(@Body() body: unknown, @Req() request: RequestWithId) {
    const result = await this.identity.signIn({
      email: emailField(body),
      password: textField(body, "password"),
      requestId: request.requestId,
    });
    return {
      session_token: result.sessionToken,
      account: {
        id: result.account.id,
        display_name: result.account.displayName,
        email: result.account.email,
        email_verified: result.account.emailVerified,
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
