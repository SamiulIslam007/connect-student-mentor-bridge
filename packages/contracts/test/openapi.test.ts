import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import { parse } from "yaml";

const contractPath = fileURLToPath(new URL("../openapi.yaml", import.meta.url));

test("the OpenAPI source parses and documents the operational endpoints", () => {
  const contract = parse(readFileSync(contractPath, "utf8"));

  assert.equal(contract.openapi, "3.1.0");
  assert.deepEqual(Object.keys(contract.paths).sort(), ["/healthz", "/readyz"]);
  for (const path of ["/healthz", "/readyz"]) {
    assert.equal(contract.paths[path].get.security.length, 0, `${path} must not require auth`);
  }
  assert.ok(
    !Object.keys(contract.paths).some((path) => path.startsWith("/v1")),
    "operational endpoints must stay outside /v1",
  );
});
