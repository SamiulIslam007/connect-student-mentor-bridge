import assert from "node:assert/strict";
import { test } from "node:test";

import { createPwnedPasswordsChecker } from "../src/identity/password-breach";

// "password" - the documented example digest, 5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8.
const SUFFIX = "1E4C9B93F3F0682250B6CF8331B7EE68FD8";

function recordingFetch(answer: (url: string) => Response | Promise<Response>) {
  const calls: string[] = [];
  const fetchImpl = (async (input: string | URL) => {
    const url = String(input);
    calls.push(url);
    return answer(url);
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

test("a breached password answers breached and sends only the prefix", async () => {
  const lines: Record<string, string>[] = [];
  const { fetchImpl, calls } = recordingFetch(
    () => new Response(`${SUFFIX}:3861493\r\n0002EEFFB2CCA91812B5CC9956854E22BEB:4`, { status: 200 }),
  );
  const checker = createPwnedPasswordsChecker({ fetchImpl, log: (line) => lines.push(line) });

  assert.equal(await checker.check("password"), "breached");
  assert.deepEqual(calls, ["https://api.pwnedpasswords.com/range/5BAA6"]);
  assert.ok(!calls[0].includes(SUFFIX), "the full digest must never be sent");
  assert.equal(lines.length, 0);
});

test("a clean password answers clean", async () => {
  const { fetchImpl } = recordingFetch(
    () => new Response("0002EEFFB2CCA91812B5CC9956854E22BEB:4", { status: 200 }),
  );
  const checker = createPwnedPasswordsChecker({ fetchImpl, log: () => {} });
  assert.equal(await checker.check("password"), "clean");
});

test("a 500, an abort, an unreadable body and a network error all answer unavailable", async () => {
  const logs: Record<string, string>[] = [];
  const log = (line: Record<string, string>) => logs.push(line);

  const five = createPwnedPasswordsChecker({
    fetchImpl: recordingFetch(() => new Response("nope", { status: 500 })).fetchImpl,
    log,
  });
  assert.equal(await five.check("password"), "unavailable");

  const aborting = (async () => {
    const error = new Error("timed out");
    error.name = "TimeoutError";
    throw error;
  }) as unknown as typeof fetch;
  assert.equal(await createPwnedPasswordsChecker({ fetchImpl: aborting, log }).check("password"), "unavailable");

  const html = createPwnedPasswordsChecker({
    fetchImpl: recordingFetch(() => new Response("<html>busy</html>", { status: 200 })).fetchImpl,
    log,
  });
  assert.equal(await html.check("password"), "unavailable");

  const offline = (async () => {
    throw new TypeError("fetch failed");
  }) as unknown as typeof fetch;
  assert.equal(await createPwnedPasswordsChecker({ fetchImpl: offline, log }).check("password"), "unavailable");

  // One line per failure, and the key set never grows beyond event and reason.
  assert.equal(logs.length, 4);
  for (const line of logs) {
    assert.deepEqual(Object.keys(line).sort(), ["event", "reason"]);
    assert.equal(line.event, "password.breach_check_unavailable");
    // The event name says "password"; no value may carry the password or the digest.
    for (const key of ["reason"]) {
      assert.equal(line[key].includes("password"), false, "no password value in the log line");
      assert.equal(/[0-9a-f]{40}/i.test(line[key]), false, "no digest in the log line");
    }
  }
});

test("the same prefix is fetched once", async () => {
  const { fetchImpl, calls } = recordingFetch(() => new Response(`${SUFFIX}:5`, { status: 200 }));
  const checker = createPwnedPasswordsChecker({ fetchImpl, log: () => {} });
  await checker.check("password");
  await checker.check("password");
  assert.equal(calls.length, 1);
});

test("the request carries the padding header and a timeout signal", async () => {
  let seen: RequestInit | undefined;
  const fetchImpl = (async (_input: string | URL, init?: RequestInit) => {
    seen = init;
    return new Response(`${SUFFIX}:5`, { status: 200 });
  }) as unknown as typeof fetch;
  await createPwnedPasswordsChecker({ fetchImpl, log: () => {} }).check("password");
  assert.equal((seen?.headers as Record<string, string>)["Add-Padding"], "true");
  assert.ok(seen?.signal, "a timeout signal is required");
});
