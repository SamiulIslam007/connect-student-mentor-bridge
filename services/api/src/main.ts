import "reflect-metadata";

import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";

import { AppModule } from "./app.module.js";
import { API_MAX_BODY_BYTES } from "./http/request-body.js";
import { apiSecurityHeaders } from "./http/security-headers.js";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
  });
  // Before the body parser: a refused body still carries the security headers.
  app.use(apiSecurityHeaders);
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
