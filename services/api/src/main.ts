import "reflect-metadata";

import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import type { IdentityService } from "@connect/domain";

import { AppModule } from "./app.module.js";
import { assertProductionSecrets } from "./config/production-guard.js";
import { createEvidenceBodyAuth } from "./http/evidence-body-auth.js";
import {
  API_MAX_BODY_BYTES,
  EVIDENCE_CONTENT_TYPES,
  EVIDENCE_MAX_BYTES,
} from "./http/request-body.js";
import { apiSecurityHeaders } from "./http/security-headers.js";
import { IDENTITY_SERVICE } from "./identity/identity.tokens.js";
import { initObservability } from "./platform/observability.js";

async function bootstrap(): Promise<void> {
  // A deployed API must not boot on a development placeholder (SEC-AUDIT-012).
  assertProductionSecrets();
  // Inert without a DSN; reports are scrubbed before they leave (D-251).
  const observability = await initObservability({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.SENTRY_ENVIRONMENT,
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0),
  });
  process.on("unhandledRejection", (error) => {
    observability.captureException(error);
    console.error(JSON.stringify({ event: "api.unhandled_rejection" }), error);
  });

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
  });
  // The API trusts the signed BFF key, never a forwarding header: `req.ip` stays
  // the socket peer even if a caller sends `x-forwarded-for` (SEC-AUDIT-001).
  app.set("trust proxy", false);
  const identity = app.get<IdentityService>(IDENTITY_SERVICE);
  // Before the body parser: a refused body still carries the security headers.
  app.use(apiSecurityHeaders);
  // Authentication before buffering: the evidence complete route is checked
  // before the 5 MiB raw parser holds the bytes (SEC-AUDIT-002).
  app.use(createEvidenceBodyAuth(identity));
  // Content-type scoped (design R10): only an evidence upload gets 5 MiB.
  app.useBodyParser("raw", { type: [...EVIDENCE_CONTENT_TYPES], limit: EVIDENCE_MAX_BYTES });
  app.useBodyParser("json", { limit: API_MAX_BODY_BYTES, strict: false });
  app.enableShutdownHooks();

  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port, "0.0.0.0");

  console.log(JSON.stringify({ event: "api.started", port }));
}

bootstrap().catch((error: unknown) => {
  console.error(JSON.stringify({ event: "api.start_failed" }), error);
  process.exit(1);
});
