import helmet, { type HelmetOptions } from "helmet";

/**
 * The API's response header set (SEC-API-3 to SEC-API-5). One module, one
 * policy, the same in every environment, so a local run cannot tell a reader
 * something the pilot will contradict.
 *
 * The policy forbids scripts, frames and forms outright: this origin serves
 * JSON to the BFF, never a document. `connect`'s own pages live on the web app,
 * which carries its own report-only policy (R4).
 */
export const API_SECURITY_HEADERS: HelmetOptions = {
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      "default-src": ["'none'"],
      "script-src": ["'none'"],
      "frame-ancestors": ["'none'"],
      "form-action": ["'none'"],
      "base-uri": ["'none'"],
      "object-src": ["'none'"],
    },
  },
  hsts: { maxAge: 31_536_000, includeSubDomains: true, preload: false },
  noSniff: true,
  referrerPolicy: { policy: "no-referrer" },
  frameguard: { action: "deny" },
  crossOriginResourcePolicy: { policy: "same-origin" },
  crossOriginOpenerPolicy: { policy: "same-origin" },
  // The framework's own advertisement is noise an attacker does not need.
  hidePoweredBy: true,
};

/** Applies the set. Called before the body parser so an early 4xx carries it too. */
export const apiSecurityHeaders = helmet(API_SECURITY_HEADERS);

/**
 * No CORS allowlist, by decision: the browser never calls this origin — every
 * browser request goes through the web BFF, which calls the API server-side —
 * so the absence of a cross-origin allow header is the restriction. Enabling it
 * needs a new decision and a failing test (SEC-API-5).
 */
