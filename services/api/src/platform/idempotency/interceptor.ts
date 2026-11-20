import {
  Inject,
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from "@nestjs/common";
import { createHash } from "node:crypto";
import type { Response } from "express";
import { from, firstValueFrom, type Observable } from "rxjs";

import { canonicalJson, IdentityError, idempotencyKeyViolation, type IdentityService } from "@connect/domain";

import { bearerToken } from "../../http/bearer.js";
import type { RequestWithId } from "../../http/request-id.middleware.js";
import { IDENTITY_SERVICE } from "../../identity/identity.tokens.js";
import { DATABASE } from "../../db/database.module.js";
import type { Database } from "../../db/database.js";
import { beginKey, completeKey } from "./store.js";
import { IDEMPOTENT_METADATA } from "./idempotent.decorator.js";

/**
 * The retryable-write interceptor (SEC-API-7, design R5/R6). It runs only where
 * `@Idempotent` set an operation: a request without the header passes straight
 * through, a first call claims the key, and a repeat replays the stored response
 * without touching the handler. A non-2xx answer stores nothing, so the five
 * minute intent expiry frees the key.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(
    @Inject(DATABASE) private readonly database: Database,
    @Inject(IDENTITY_SERVICE) private readonly identity: IdentityService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return from(this.handle(context, next));
  }

  private async handle(context: ExecutionContext, next: CallHandler): Promise<unknown> {
    // No `Reflector`: this project emits no parameter metadata, so a metadata
    // read is the one injection-free way to find the decorator's operation.
    const operation =
      (Reflect.getMetadata(IDEMPOTENT_METADATA, context.getHandler()) as string | undefined) ??
      (Reflect.getMetadata(IDEMPOTENT_METADATA, context.getClass()) as string | undefined);
    if (!operation) {
      return firstValueFrom(next.handle());
    }

    const request = context.switchToHttp().getRequest<RequestWithId>();
    const header = request.headers["idempotency-key"];
    const key = Array.isArray(header) ? header[0] : header;
    if (key === undefined || key === "") {
      return firstValueFrom(next.handle());
    }

    const violation = idempotencyKeyViolation(key);
    if (violation) {
      throw new IdentityError("IDEMPOTENCY_KEY_INVALID", violation);
    }

    const account = await this.identity.getSession({ sessionToken: bearerToken(request) });
    if (!account) {
      throw new IdentityError("SESSION_INVALID", "the session is not valid");
    }

    const digest = createHash("sha256")
      .update(canonicalJson(request.body ?? {}))
      .digest("hex");
    const begun = await beginKey(this.database, {
      actorUserId: account.id,
      operation,
      key,
      digest,
    });

    if (begun.kind === "existing") {
      if (begun.row.requestDigest !== digest) {
        throw new IdentityError(
          "IDEMPOTENCY_KEY_REUSED",
          "this Idempotency-Key was used with a different request body",
        );
      }
      if (begun.row.status !== "COMPLETED") {
        throw new IdentityError(
          "IDEMPOTENCY_IN_PROGRESS",
          "this Idempotency-Key is still being processed",
        );
      }
      const response = context.switchToHttp().getResponse<Response>();
      if (typeof begun.row.responseStatus === "number") {
        response.status(begun.row.responseStatus);
      }
      return begun.row.responseBody;
    }

    const value: unknown = await firstValueFrom(next.handle());
    const status = context.switchToHttp().getResponse<Response>().statusCode;
    if (status >= 200 && status < 300) {
      await completeKey(this.database, { id: begun.id, status, body: value });
    }
    return value;
  }
}
