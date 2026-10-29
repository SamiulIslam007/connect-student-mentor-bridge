import "reflect-metadata";

import { NestFactory } from "@nestjs/core";

import { AppModule } from "./app.module.js";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();

  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port, "0.0.0.0");

  console.log(JSON.stringify({ event: "api.started", port }));
}

bootstrap().catch((error: unknown) => {
  console.error(JSON.stringify({ event: "api.start_failed" }), error);
  process.exit(1);
});
