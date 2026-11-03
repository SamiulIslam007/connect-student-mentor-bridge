import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * The repository keeps one `.env` at the root, and `drizzle-kit`, the seed, and
 * the tests all run from `services/api`. Resolve the URL from the environment
 * first, then from that file. Values are never logged.
 */
export function resolveDatabaseUrl(
  environment: NodeJS.ProcessEnv = process.env,
  cwd: string = process.cwd(),
): string {
  if (environment.DATABASE_URL) {
    return environment.DATABASE_URL;
  }

  for (const candidate of [resolve(cwd, "../../.env"), resolve(cwd, ".env")]) {
    if (!existsSync(candidate)) {
      continue;
    }
    for (const line of readFileSync(candidate, "utf8").split(/\r?\n/)) {
      const match = /^DATABASE_URL=(.*)$/.exec(line.trim());
      if (match) {
        return match[1].replace(/^["']|["']$/g, "");
      }
    }
  }

  throw new Error("DATABASE_URL is not configured (environment or repository-root .env)");
}
