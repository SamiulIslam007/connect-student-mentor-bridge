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
