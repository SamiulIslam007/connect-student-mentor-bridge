import {
  Catch,
  HttpException,
  type ArgumentsHost,
  type ExceptionFilter,
} from "@nestjs/common";
import type { Request, Response } from "express";

import { IdentityError, type IdentityErrorCode } from "@connect/domain";

import type { Database } from "../db/database.js";
import { appendAuditEntry, type AuditEntry } from "../identity/audit-log.js";
import type { RequestWithId } from "./request-id.middleware.js";


interface ProblemMapping {
  status: number;
  code: string;
  title: string;
}

const PROBLEMS: Record<IdentityErrorCode, ProblemMapping> = {
  VALIDATION_ERROR: { status: 422, code: "VALIDATION_FAILED", title: "Request validation failed" },
  UNDER_MINIMUM_AGE: { status: 422, code: "UNDER_MINIMUM_AGE", title: "Registration requires an age of 18 or older" },
  INVALID_CREDENTIALS: { status: 401, code: "UNAUTHENTICATED", title: "Authentication failed" },
  SESSION_INVALID: { status: 401, code: "UNAUTHENTICATED", title: "The session is not valid" },
  INVALID_VERIFICATION_LINK: { status: 400, code: "INVALID_VERIFICATION_LINK", title: "The verification link is invalid or expired" },
  INVALID_RESET_TOKEN: { status: 400, code: "INVALID_RESET_TOKEN", title: "The reset link is invalid or expired" },
  EMAIL_NOT_VERIFIED: { status: 403, code: "EMAIL_NOT_VERIFIED", title: "Confirm your email address before signing in" },
  ACCOUNT_SUSPENDED: { status: 403, code: "ACCOUNT_SUSPENDED", title: "This account is suspended" },
  FORBIDDEN: { status: 403, code: "FORBIDDEN", title: "This account cannot sign in" },
  ROLE_REQUIRED: { status: 403, code: "ROLE_REQUIRED", title: "This action requires a role the account does not hold" },
  MFA_REQUIRED: { status: 403, code: "MFA_REQUIRED", title: "This action requires an enrolled second factor" },
  PROVIDER_UNAVAILABLE: { status: 503, code: "PROVIDER_UNAVAILABLE", title: "This sign-in provider is not configured" },
  SESSION_NOT_FOUND: { status: 404, code: "NOT_FOUND", title: "Not found" },
  AFFILIATION_EMAIL_UNVERIFIED: { status: 422, code: "AFFILIATION_EMAIL_UNVERIFIED", title: "Confirm your email address before claiming an affiliation" },
  AFFILIATION_INSTITUTION_MISMATCH: { status: 422, code: "AFFILIATION_INSTITUTION_MISMATCH", title: "No registered institution matches the claim" },
  MENTOR_NOT_VERIFIED: { status: 409, code: "MENTOR_NOT_VERIFIED", title: "This mentor has no verified Level 1 affiliation" },
  MENTOR_UNAVAILABLE: { status: 409, code: "MENTOR_UNAVAILABLE", title: "This mentor is not accepting requests right now" },
  MENTOR_AT_CAPACITY: { status: 409, code: "MENTOR_AT_CAPACITY", title: "This mentor is at weekly capacity" },
  DUPLICATE_PENDING_REQUEST: { status: 409, code: "DUPLICATE_PENDING_REQUEST", title: "You already have a pending request with this mentor" },
  REQUEST_LIMIT_REACHED: { status: 409, code: "REQUEST_LIMIT_REACHED", title: "Too many pending requests" },
  REQUEST_INVALID_STATE: { status: 409, code: "REQUEST_INVALID_STATE", title: "This request cannot take that action now" },
  MENTORSHIP_INVALID_STATE: { status: 409, code: "MENTORSHIP_INVALID_STATE", title: "This mentorship cannot take that action now" },
  CAPACITY_BELOW_ACTIVE: { status: 409, code: "CAPACITY_BELOW_ACTIVE", title: "Resuming needs a free mentoring slot" },
  OUTCOME_INVALID_STATE: { status: 409, code: "OUTCOME_INVALID_STATE", title: "This outcome cannot take that action now" },
  REPORT_ALREADY_RESOLVED: { status: 409, code: "REPORT_ALREADY_RESOLVED", title: "This report is already resolved" },
  STUDENT_PROFILE_REQUIRED: { status: 422, code: "STUDENT_PROFILE_REQUIRED", title: "Save a student profile before asking for suggestions" },
  CLAIM_ALREADY_DECIDED: { status: 409, code: "CLAIM_ALREADY_DECIDED", title: "This claim has already been decided" },
  INSTITUTION_DOMAIN_TAKEN: { status: 409, code: "INSTITUTION_DOMAIN_TAKEN", title: "This domain already belongs to an institution" },
  ACCOUNT_NOT_SUSPENDED: { status: 409, code: "ACCOUNT_NOT_SUSPENDED", title: "This account is not suspended" },
};

const PROBLEM_BASE = "https://docs.connect.example/problems/";

/**
 * RFC 9457 problem details (docs/api-contracts.md section 1.3). Internal faults
 * return a fixed body; the detail stays in the log (SEC-API-6).
 */
@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  constructor(private readonly database?: Database) {}

  async catch(exception: unknown, host: ArgumentsHost): Promise<void> {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();
    const request = context.getRequest<Request & { requestId?: string }>();
    const requestId = request.requestId ?? "unattributed";

    if (exception instanceof IdentityError) {
      // Awaited before the response so a caller that retries immediately cannot
      // outrun the row (design R3).
      await this.recordDenial(exception, request as RequestWithId, requestId);
      const problem = PROBLEMS[exception.code];
      response
        .status(problem.status)
        .type("application/problem+json")
        .json({
          type: `${PROBLEM_BASE}${problem.code.toLowerCase()}`,
          title: problem.title,
          status: problem.status,
          detail: exception.message,
          instance: request.originalUrl,
          code: problem.code,
          request_id: requestId,
        });
      return;
    }

    // One boundary for both throttlers: `@nestjs/throttler`'s own exception and
    // the identity library's raw 429 (design D8; DEBT-12 closes here).
    const rawStatus =
      (exception as { statusCode?: unknown }).statusCode ??
      (exception as { status?: unknown }).status;
    const throttled =
      rawStatus === 429 || (exception instanceof HttpException && exception.getStatus() === 429);
    if (throttled) {
      // A named throttler writes `Retry-After-account`, so the plain name is
      // absent when the account bucket blocks. The longest wait wins (D-118).
      const waits = Object.entries(response.getHeaders())
        .filter(([name]) => name.toLowerCase().startsWith("retry-after"))
        .map(([, value]) => Number(Array.isArray(value) ? value[0] : value))
        .filter((value) => Number.isFinite(value) && value > 0);
      const retryAfter = waits.length > 0 ? Math.ceil(Math.max(...waits)) : 60;
      response
        .setHeader("Retry-After", String(retryAfter))
        .status(429)
        .type("application/problem+json")
        .json({
          type: `${PROBLEM_BASE}rate-limited`,
          title: "Too many requests",
          status: 429,
          detail: "try again later",
          instance: request.originalUrl,
          code: "RATE_LIMITED",
          request_id: requestId,
        });
      return;
    }

    // body-parser rejects an oversized body before a handler runs; Nest does not
    // wrap that error, so it must not fall through to the generic 500.
    if (rawStatus === 413 || (exception as { type?: unknown }).type === "entity.too.large") {
      response
        .status(413)
        .type("application/problem+json")
        .json({
          type: `${PROBLEM_BASE}payload-too-large`,
          title: "Request body is too large",
          status: 413,
          detail: "the request body is larger than the API accepts",
          instance: request.originalUrl,
          code: "PAYLOAD_TOO_LARGE",
          request_id: requestId,
        });
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      response
        .status(status)
        .type("application/problem+json")
        .json({
          type: `${PROBLEM_BASE}${status === 404 ? "not-found" : "request-rejected"}`,
          title: status === 404 ? "Not found" : "Request rejected",
          status,
          instance: request.originalUrl,
          code: status === 404 ? "NOT_FOUND" : "VALIDATION_FAILED",
          request_id: requestId,
        });
      return;
    }

    console.error(
      JSON.stringify({
        event: "api.request_failed",
        request_id: requestId,
        method: request.method,
        path: request.originalUrl,
        message: exception instanceof Error ? exception.message : "unknown error",
      }),
      exception,
    );
    response
      .status(500)
      .type("application/problem+json")
      .json({
        type: `${PROBLEM_BASE}internal-error`,
        title: "Unexpected error",
        status: 500,
        instance: request.originalUrl,
        code: "INTERNAL_ERROR",
        request_id: requestId,
      });
  }

  /**
   * One row for a refusal on a sensitive action (D-152). The response is already
   * decided, so a failure here is logged and never surfaced: turning a 403 into a
   * 500 because the log could not be written would be the worse trade (design R5).
   */
  private async recordDenial(
    exception: IdentityError,
    request: RequestWithId,
    requestId: string,
  ): Promise<void> {
    if (exception.code !== "ROLE_REQUIRED" && exception.code !== "MFA_REQUIRED") {
      return;
    }
    const denial = request.sensitiveDenial;
    const acting = request.actingAccount;
    if (!denial || !acting || !this.database) {
      return;
    }
    const entry: AuditEntry = {
      action: "PERMISSION_DENIED",
      actorUserId: acting.userId,
      actorRole: acting.roles[0] ?? "ANONYMOUS",
      objectType: "users",
      objectId: acting.userId,
      requestId,
      metadata: {
        method: request.method,
        path: request.originalUrl,
        required_role: denial.requiredRole,
      },
    };
    try {
      await appendAuditEntry(this.database, entry);
    } catch (error) {
      // The refusal is already decided; a log failure must not become an outage (R5).
      console.error(
        JSON.stringify({
          event: "audit.denial_failed",
          request_id: requestId,
          message: error instanceof Error ? error.message : "unknown error",
        }),
      );
    }
  }
}
