import {
  Catch,
  HttpException,
  type ArgumentsHost,
  type ExceptionFilter,
} from "@nestjs/common";
import type { Request, Response } from "express";

import { IdentityError, type IdentityErrorCode } from "@connect/domain";

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
};

const PROBLEM_BASE = "https://docs.connect.example/problems/";

/**
 * RFC 9457 problem details (docs/api-contracts.md section 1.3). Internal faults
 * return a fixed body; the detail stays in the log (SEC-API-6).
 */
@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();
    const request = context.getRequest<Request & { requestId?: string }>();
    const requestId = request.requestId ?? "unattributed";

    if (exception instanceof IdentityError) {
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
}
