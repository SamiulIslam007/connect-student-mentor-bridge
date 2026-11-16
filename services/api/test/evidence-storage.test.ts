import assert from "node:assert/strict";
import { test } from "node:test";

import type { S3Client } from "@aws-sdk/client-s3";

import {
  EVIDENCE_URL_TTL_SECONDS,
  S3EvidenceStorage,
  evidenceStorageConfig,
  type EvidenceStorageConfig,
} from "../src/evidence/storage.js";

const CONFIG: EvidenceStorageConfig = {
  endpoint: "http://objectstore:7070",
  publicEndpoint: "http://localhost:7070",
  region: "us-east-1",
  bucket: "connect-local",
  accessKeyId: "local-dev-only",
  secretAccessKey: "local-dev-only",
  forcePathStyle: true,
};

interface Recorded {
  name: string;
  input: Record<string, unknown>;
}

class FakeS3Client {
  readonly calls: Recorded[] = [];

  constructor(private readonly respond: (name: string) => unknown = () => ({})) {}

  async send(command: { constructor: { name: string }; input: unknown }): Promise<unknown> {
    this.calls.push({
      name: command.constructor.name,
      input: command.input as Record<string, unknown>,
    });
    return this.respond(command.constructor.name);
  }
}

test("a missing credential or bucket means no storage at all", () => {
  assert.equal(evidenceStorageConfig({}), null);
  assert.equal(evidenceStorageConfig({ S3_ENDPOINT: "http://x" }), null);
  assert.equal(
    evidenceStorageConfig({
      S3_ENDPOINT: "http://x",
      S3_BUCKET: "b",
      S3_ACCESS_KEY_ID: "k",
    }),
    null,
    "a secret is required",
  );

  const full = evidenceStorageConfig({
    S3_ENDPOINT: "http://objectstore:7070",
    S3_BUCKET: "b",
    S3_ACCESS_KEY_ID: "k",
    S3_SECRET_ACCESS_KEY: "s",
  });
  assert.ok(full);
  assert.equal(full.publicEndpoint, "http://objectstore:7070", "the public host defaults to the internal one");
  assert.equal(full.region, "us-east-1");
  assert.equal(full.forcePathStyle, true);
});

test("put sends the bytes, the declared type and the length", async () => {
  const client = new FakeS3Client();
  const storage = new S3EvidenceStorage(CONFIG, { client: client as unknown as S3Client });
  const bytes = Buffer.from("%PDF-1.4\n%%EOF\n");

  await storage.put("outcome-evidence/o/e", bytes, "application/pdf");

  assert.equal(client.calls[0]?.name, "PutObjectCommand");
  assert.equal(client.calls[0]?.input.Bucket, "connect-local");
  assert.equal(client.calls[0]?.input.Key, "outcome-evidence/o/e");
  assert.equal(client.calls[0]?.input.ContentType, "application/pdf");
  assert.equal(client.calls[0]?.input.ContentLength, bytes.length);
  assert.deepEqual(client.calls[0]?.input.Body, bytes);
});

test("get returns the object's bytes and delete names the key", async () => {
  const client = new FakeS3Client((name) =>
    name === "GetObjectCommand"
      ? { Body: { transformToByteArray: async () => new Uint8Array([1, 2, 3]) } }
      : {},
  );
  const storage = new S3EvidenceStorage(CONFIG, { client: client as unknown as S3Client });

  assert.deepEqual(await storage.get("k"), Buffer.from([1, 2, 3]));
  await storage.delete("k");
  assert.deepEqual(
    client.calls.map((call) => call.name),
    ["GetObjectCommand", "DeleteObjectCommand"],
  );
  assert.equal(client.calls[1]?.input.Key, "k");
});

test("a presigned GET is signed against the public endpoint for five minutes", async () => {
  // Signing is local computation, so the real client needs no store to answer.
  const storage = new S3EvidenceStorage(CONFIG);
  const url = await storage.presignGet("outcome-evidence/o/e");

  assert.equal(EVIDENCE_URL_TTL_SECONDS, 300);
  assert.match(url, /^http:\/\/localhost:7070\/connect-local\/outcome-evidence\/o\/e\?/);
  assert.match(url, /X-Amz-Expires=300/);
});
