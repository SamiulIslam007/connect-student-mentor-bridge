import "reflect-metadata";

import { NestFactory } from "@nestjs/core";

import { WorkerModule } from "./platform/outbox/worker.module.js";

/**
 * Worker entrypoint. It shares the API image but opens no HTTP port (ADR-016)
 * and exits non-zero when it cannot start, so the orchestrator restarts it.
 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(WorkerModule, { logger: false });
  app.enableShutdownHooks();
}

bootstrap().catch((error: unknown) => {
  console.error(JSON.stringify({ event: "worker.failed", reason: "startup" }), error);
  process.exit(1);
});
