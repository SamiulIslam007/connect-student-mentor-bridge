import { randomUUID } from "node:crypto";

import { Injectable, type NestMiddleware } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";

export interface RequestWithId extends Request {
  requestId: string;
}

const MAX_INCOMING_REQUEST_ID_LENGTH = 128;

/** Correlates the log line, the audit entry, and the error body (X-Request-Id). */
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(request: RequestWithId, response: Response, next: NextFunction): void {
    const incoming = request.headers["x-request-id"];
    request.requestId =
      typeof incoming === "string" && incoming.length > 0 && incoming.length <= MAX_INCOMING_REQUEST_ID_LENGTH
        ? incoming
        : randomUUID();
    response.setHeader("X-Request-Id", request.requestId);
    next();
  }
}
