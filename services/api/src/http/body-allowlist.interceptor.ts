import { Injectable, type CallHandler, type ExecutionContext, type NestInterceptor } from "@nestjs/common";
import type { Request } from "express";
import type { Observable } from "rxjs";

import { ROUTE_BODY_KEYS } from "@connect/contracts";

import { bodyKeys } from "./request-body.js";

/**
 * Refuses an undocumented body property on every non-GET route before the
 * handler reads it. One interceptor + one registry beats threading a constant
 * through every controller, and a route missing from the registry fails the
 * inventory test (design D1/D4 of `request-validation-and-rate-limits`).
 */
@Injectable()
export class BodyAllowlistInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context
      .switchToHttp()
      .getRequest<Request & { route?: { path?: string } }>();

    if (request.method !== "GET" && request.method !== "HEAD" && request.method !== "DELETE") {
      // A binary body (an evidence upload) has no top-level keys to allowlist;
      // its byte indices would otherwise read as "unknown property: 0" (R9).
      if (Buffer.isBuffer(request.body)) {
        return next.handle();
      }
      const path = request.route?.path ?? request.path;
      const allowed = ROUTE_BODY_KEYS[`${request.method} ${path}`];
      if (allowed) {
        bodyKeys(request.body, allowed);
      }
    }
    return next.handle();
  }
}
