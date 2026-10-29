/**
 * Worker entrypoint. It shares the API image and build but opens no HTTP port
 * (ADR-016). Queue processing (pg-boss) arrives in a later change; until then
 * the process stays alive and fails loudly on a startup error.
 */
const log = (event: string, detail: Record<string, unknown> = {}): void => {
  console.log(JSON.stringify({ event, ...detail }));
};

log("worker.started", { service: "api-worker" });

const keepAlive = setInterval(() => undefined, 60_000);

const shutdown = (signal: string): void => {
  clearInterval(keepAlive);
  log("worker.stopped", { signal });
  process.exit(0);
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

const fail = (reason: string, error: unknown): void => {
  console.error(JSON.stringify({ event: "worker.failed", reason }), error);
  process.exit(1);
};

process.on("uncaughtException", (error) => fail("uncaughtException", error));
process.on("unhandledRejection", (error) => fail("unhandledRejection", error));
