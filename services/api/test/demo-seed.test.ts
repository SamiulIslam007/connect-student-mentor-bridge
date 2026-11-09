import assert from "node:assert/strict";
import { test } from "node:test";

import { demoSeedRefusal } from "../src/db/seed/demo-mentors.js";

test("the demo mentor seed refuses production and a missing flag", () => {
  assert.match(
    String(demoSeedRefusal({ NODE_ENV: "production", SEED_DEMO_MENTORS: "1" })),
    /never runs in production/,
  );
  assert.match(String(demoSeedRefusal({ SEED_DEMO_MENTORS: "0" })), /SEED_DEMO_MENTORS=1/);
  assert.match(String(demoSeedRefusal({})), /SEED_DEMO_MENTORS=1/);
  assert.equal(demoSeedRefusal({ NODE_ENV: "development", SEED_DEMO_MENTORS: "1" }), null);
});
