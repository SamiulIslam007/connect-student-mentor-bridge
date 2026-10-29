import { Client } from "pg";

import { READINESS_TIMEOUT_MS } from "@connect/config";

export type DependencyStatus = "ok" | "unavailable";

/** A readiness check for one dependency. */
export type DatabaseProbe = () => Promise<DependencyStatus>;

type QueryRunner = () => Promise<unknown>;

export interface DatabaseProbeOptions {
  timeoutMs?: number;
  /** Test seam: replaces the real `pg` check. */
  query?: QueryRunner;
  /** Internal log sink. Error detail never reaches the HTTP response. */
  log?: (message: string, error: unknown) => void;
}

const defaultLog = (message: string, error: unknown): void => {
  console.error(JSON.stringify({ event: "readiness.database_failed", message }), error);
};

async function queryDatabase(connectionString: string, timeoutMs: number): Promise<void> {
  const client = new Client({
    connectionString,
    connectionTimeoutMillis: timeoutMs,
    query_timeout: timeoutMs,
  });
  try {
    await client.connect();
    await client.query("SELECT 1");
  } finally {
    await client.end().catch(() => undefined);
  }
}

/**
 * Bounded database check (design.md D5). Returns a fixed status value only;
 * the error itself is logged internally and never returned.
 */
export async function probeDatabase(
  connectionString: string | undefined,
  options: DatabaseProbeOptions = {},
): Promise<DependencyStatus> {
  const { timeoutMs = READINESS_TIMEOUT_MS, query, log = defaultLog } = options;

  if (!query && !connectionString) {
    log("DATABASE_URL is not configured", new Error("DATABASE_URL is not configured"));
    return "unavailable";
  }

  const run: QueryRunner = query ?? (() => queryDatabase(connectionString as string, timeoutMs));
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    await Promise.race([
      run(),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error("database readiness probe timed out")),
          timeoutMs,
        );
      }),
    ]);
    return "ok";
  } catch (error) {
    log("database readiness probe failed", error);
    return "unavailable";
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}
