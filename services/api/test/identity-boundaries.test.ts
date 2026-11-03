import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { test } from "node:test";

const sourceRoot = resolve(process.cwd(), "src");

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return sourceFiles(path);
    }
    return entry.name.endsWith(".ts") ? [path] : [];
  });
}

test("better-auth is imported only inside src/identity", () => {
  const identityDirectory = `${join(sourceRoot, "identity")}`;
  const offenders = sourceFiles(sourceRoot)
    .filter((file) => /from\s+"(better-auth|@better-auth\/)/.test(readFileSync(file, "utf8")))
    .filter((file) => !file.startsWith(identityDirectory))
    .map((file) => file.slice(sourceRoot.length + 1));

  assert.deepEqual(offenders, [], `these files import the identity library: ${offenders.join(", ")}`);
});

test("packages/domain never imports a driver, framework, or auth library", () => {
  const domainSource = resolve(process.cwd(), "../../packages/domain/src");
  const offenders = sourceFiles(domainSource).filter((file) =>
    /from\s+"(@nestjs|better-auth|@better-auth\/|pg|drizzle-orm|npm:)/.test(readFileSync(file, "utf8")),
  );

  assert.deepEqual(offenders, []);
});
