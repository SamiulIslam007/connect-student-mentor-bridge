import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { test } from "node:test";

import { scanBytes } from "../src/evidence/scan.js";

/** A socket stand-in: the scan's framing is asserted on what it writes. */
class FakeSocket extends EventEmitter {
  readonly written: Buffer[] = [];
  destroyed = false;

  write(chunk: Uint8Array | string): boolean {
    this.written.push(Buffer.from(chunk));
    return true;
  }

  destroy(): void {
    this.destroyed = true;
  }

  reply(text: string): void {
    setImmediate(() => {
      this.emit("data", Buffer.from(`${text}\0`));
      this.emit("end");
    });
  }
}

function socketFor(
  behaviour: (socket: FakeSocket) => void,
): { socket: FakeSocket; connect: () => FakeSocket } {
  const socket = new FakeSocket();
  return {
    socket,
    connect: () => {
      setImmediate(() => {
        socket.emit("connect");
        behaviour(socket);
      });
      return socket;
    },
  };
}

test("a clean answer is clean, and the framing carries a zero terminator", async () => {
  const { socket, connect } = socketFor((fake) => fake.reply("stream: OK"));
  const bytes = Buffer.from("hello");

  const result = await scanBytes(bytes, { host: "clamav", connect });

  assert.deepEqual(result, { clean: true });
  const written = Buffer.concat(socket.written);
  assert.equal(written.subarray(0, 10).toString(), "zINSTREAM\0");
  const header = written.subarray(10, 14);
  assert.equal(header.readUInt32BE(0), bytes.length, "each chunk is length-prefixed");
  assert.equal(written.subarray(14, 19).toString(), "hello");
  assert.deepEqual([...written.subarray(19, 23)], [0, 0, 0, 0], "the stream ends with a zero length");
  assert.equal(socket.destroyed, true, "the conversation is closed");
});

test("a detection is not clean and names the signature", async () => {
  const { connect } = socketFor((fake) => fake.reply("stream: Eicar-Test-Signature FOUND"));

  assert.deepEqual(await scanBytes(Buffer.from("x"), { host: "clamav", connect }), {
    clean: false,
    signature: "Eicar-Test-Signature",
  });
});

test("a socket error, a timeout and an unparseable reply all fail closed", async () => {
  const { connect: errorConnect } = socketFor((fake) =>
    setImmediate(() => fake.emit("error", new Error("connection refused"))),
  );
  assert.deepEqual(await scanBytes(Buffer.from("x"), { host: "clamav", connect: errorConnect }), {
    error: "connection refused",
  });

  const { connect: silentConnect } = socketFor(() => undefined);
  const timedOut = await scanBytes(Buffer.from("x"), {
    host: "clamav",
    connect: silentConnect,
    timeoutMs: 10,
  });
  assert.deepEqual(timedOut, { error: "the scanner did not answer in time" });

  const { connect: oddConnect } = socketFor((fake) => fake.reply("garbage"));
  assert.deepEqual(await scanBytes(Buffer.from("x"), { host: "clamav", connect: oddConnect }), {
    error: "garbage",
  });
});

test("a missing scanner host is an error, never a clean result", async () => {
  const result = await scanBytes(Buffer.from("x"), { host: "" });
  assert.deepEqual(result, { error: "CLAMAV_HOST is not configured" });
});
