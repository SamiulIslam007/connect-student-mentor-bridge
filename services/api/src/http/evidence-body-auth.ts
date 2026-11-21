import type { IdentityService } from "@connect/domain";
import type { NextFunction, Request, Response } from "express";

/**
 * Authenticate the two evidence upload routes before the 5 MiB raw parser runs
 * (SEC-AUDIT-002, D-254). Express parses a registered body type before Nest's
 * guards, so the session check has to be Express middleware placed before
 * `useBodyParser("raw")`. Object-level authorization stays in the controller.
 */
const EVIDENCE_ROUTE = /^\/v1\/outcomes\/[^/]+\/evidence(?:\/[^/]+\/complete)?\/?$/;

export function createEvidenceBodyAuth(identity: IdentityService) {
  return async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    if (request.method !== "POST" || !EVIDENCE_ROUTE.test(request.path)) {
      next();
      return;
    }

    const header = request.headers.authorization ?? "";
    const token = header.toLowerCase().startsWith("bearer ") ? header.slice("bearer ".length).trim() : "";

    try {
      const account = token ? await identity.getSession({ sessionToken: token }) : null;
      if (!account) {
        response.status(401).json({
          type: "https://docs.connect.example/problems/session-invalid",
          title: "The session is not valid",
          status: 401,
          code: "UNAUTHENTICATED",
        });
        return;
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}
