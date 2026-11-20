import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import { after, before, beforeEach, test, type TestContext } from "node:test";

import { AuditController } from "../src/audit/audit.controller.js";
import { AUDIT_SERVICE } from "../src/audit/audit.tokens.js";
import { DrizzleAuditService } from "../src/audit/drizzle-audit.service.js";
import { AffiliationsController } from "../src/affiliations/affiliations.controller.js";
import { AFFILIATIONS_SERVICE } from "../src/affiliations/affiliations.tokens.js";
import { DrizzleAffiliationsService } from "../src/affiliations/drizzle-affiliations.service.js";
import type { Database } from "../src/db/database.js";
import { DrizzleEvidenceService } from "../src/evidence/drizzle-evidence.service.js";
import { EvidenceController } from "../src/evidence/evidence.controller.js";
import { EVIDENCE_SERVICE } from "../src/evidence/evidence.tokens.js";
import {
  scanQuarantinedEvidence,
  type ScanJobResult,
} from "../src/evidence/scan-job.js";
import type { ScanResult } from "../src/evidence/scan.js";
import { sweepExpiredEvidence } from "../src/evidence/retention.js";
import type { EvidenceStorage } from "../src/evidence/storage.js";
import { AuthController } from "../src/identity/auth.controller.js";
import { MeController } from "../src/me/me.controller.js";
import { MeRolesController } from "../src/me/roles.controller.js";
import { DrizzleMentorshipService } from "../src/mentorships/drizzle-mentorship.service.js";
import { MentorshipsController, SessionsController } from "../src/mentorships/mentorships.controller.js";
import { MENTORSHIP_SERVICE } from "../src/mentorships/mentorships.tokens.js";
import { DrizzleOutcomeService } from "../src/outcomes/drizzle-outcome.service.js";
import { OutcomesController } from "../src/outcomes/outcomes.controller.js";
import { OUTCOME_SERVICE } from "../src/outcomes/outcomes.tokens.js";
import { DrizzleProfilesService } from "../src/profiles/drizzle-profiles.service.js";
import { ProfilesController } from "../src/profiles/profiles.controller.js";
import { PROFILES_SERVICE } from "../src/profiles/profiles.tokens.js";
import { countDueOutcomes } from "../src/reputation/counting-job.js";
import { DrizzleRequestsService } from "../src/requests/drizzle-requests.service.js";
import { RequestsController } from "../src/requests/requests.controller.js";
import { REQUESTS_SERVICE } from "../src/requests/requests.tokens.js";
import { grantMentorAgreements } from "./support/agreements.js";
import {
  apiRequest,
  registerAndVerify,
  signIn,
  startApiStack,
  TEST_PASSWORD,
  type HttpResult,
  type TestApiStack,
} from "./support/api-stack.js";
import { truncateAll } from "./support/database.js";

const PDF = Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n");
const sha256 = (bytes: Buffer): string => createHash("sha256").update(bytes).digest("hex");

/** The one seam the routes reach the store through; no network, no container. */
class FakeStorage implements EvidenceStorage {
  readonly objects = new Map<string, Buffer>();
  readonly deleted: string[] = [];
  failDelete = new Set<string>();

  async put(key: string, bytes: Buffer): Promise<void> {
    this.objects.set(key, Buffer.from(bytes));
  }

  async get(key: string): Promise<Buffer> {
    const found = this.objects.get(key);
    if (!found) {
      throw new Error(`no object ${key}`);
    }
    return found;
  }

  async delete(key: string): Promise<void> {
    if (this.failDelete.has(key)) {
      throw new Error("the store refused the delete");
    }
    this.objects.delete(key);
    this.deleted.push(key);
  }

  async presignGet(key: string): Promise<string> {
    return `https://store.example/${key}?signature=fake`;
  }
}

const storage = new FakeStorage();

let stack: TestApiStack | undefined;
let skipReason = "connect_test is not reachable";

const CONTROLLERS = [
  AuthController,
  MeController,
  MeRolesController,
  ProfilesController,
  AffiliationsController,
  RequestsController,
  MentorshipsController,
  SessionsController,
  OutcomesController,
  EvidenceController,
  AuditController,
];

function providers(database: Database, evidenceStorage: EvidenceStorage | null) {
  return [
    { provide: PROFILES_SERVICE, useValue: new DrizzleProfilesService(database) },
    { provide: AFFILIATIONS_SERVICE, useValue: new DrizzleAffiliationsService(database) },
    { provide: REQUESTS_SERVICE, useValue: new DrizzleRequestsService(database) },
    { provide: MENTORSHIP_SERVICE, useValue: new DrizzleMentorshipService(database) },
    { provide: OUTCOME_SERVICE, useValue: new DrizzleOutcomeService(database) },
    { provide: EVIDENCE_SERVICE, useValue: new DrizzleEvidenceService(database, evidenceStorage) },
    { provide: AUDIT_SERVICE, useValue: new DrizzleAuditService(database) },
  ];
}

before(async () => {
  const started = await startApiStack({
    controllers: CONTROLLERS,
    requestIdRoutes: CONTROLLERS,
    providers: (database) => providers(database, storage),
  });
  if (started.skipped) {
    skipReason = started.reason;
    return;
  }
  stack = started.stack;
});

beforeEach(async () => {
  storage.objects.clear();
  storage.deleted.length = 0;
  storage.failDelete = new Set();
  if (stack) {
    await truncateAll(stack.client);
    await stack.client.query("DELETE FROM outbox_events");
    // An affiliation needs an institution whose domain matches the mentor's email.
    await stack.client.query("TRUNCATE TABLE institution_domains, institutions CASCADE");
    await stack.client.query(
      "INSERT INTO institutions (id, name, kind, country_code, status) VALUES ('22222222-2222-2222-2222-222222222222', 'Evidence University', 'UNIVERSITY', 'BD', 'ACTIVE')",
    );
    await stack.client.query(
      "INSERT INTO institution_domains (institution_id, domain) VALUES ('22222222-2222-2222-2222-222222222222', 'example.edu.bd')",
    );
  }
});

after(async () => {
  await stack?.close();
});

function requireStack(context: TestContext): TestApiStack | null {
  if (!stack) {
    context.skip(skipReason);
    return null;
  }
  return stack;
}

async function tokenFor(current: TestApiStack, email: string): Promise<string> {
  await registerAndVerify(current, email);
  const signedIn = await signIn(current, email);
  assert.equal(signedIn.status, 200, signedIn.text);
  return String(signedIn.body?.session_token);
}

async function studentWithProfile(current: TestApiStack, email: string): Promise<string> {
  const token = await tokenFor(current, email);
  const saved = await apiRequest(
    current,
    "PUT",
    "/v1/me/student-profile",
    { goals: "Find an internship", primary_field: "Engineering" },
    token,
  );
  assert.equal(saved.status, 200, saved.text);
  return token;
}

/** The mentor becomes ACTIVE only with an enrolled factor (D-150), so the fixture enrolls one. */
function totpCode(secret: string): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const character of secret) {
    bits += alphabet.indexOf(character).toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let index = 0; index + 8 <= bits.length; index += 8) {
    bytes.push(Number.parseInt(bits.slice(index, index + 8), 2));
  }
  const counter = Math.floor(Date.now() / 30_000);
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", Buffer.from(bytes)).update(message).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const value =
    ((digest[offset] & 0x7f) << 24) |
    (digest[offset + 1] << 16) |
    (digest[offset + 2] << 8) |
    digest[offset + 3];
  return String(value % 1_000_000).padStart(6, "0");
}

async function activeMentor(current: TestApiStack, email: string) {
  const token = await tokenFor(current, email);
  assert.equal((await apiRequest(current, "POST", "/v1/me/roles/mentor", undefined, token)).status, 200);
  const saved = await apiRequest(
    current,
    "PUT",
    "/v1/me/mentor-profile",
    {
      headline: "Mentor",
      bio: "Bio",
      expertise_summary: "Summary",
      scope_statement: "Scope",
      primary_field: "Engineering",
      weekly_capacity: 2,
    },
    token,
  );
  assert.equal(saved.status, 200, saved.text);
  assert.equal(
    (await apiRequest(current, "POST", "/v1/me/affiliations", { kind: "ALUMNUS" }, token)).status,
    200,
  );
  await grantMentorAgreements(current.client, email);
  const enrollment = await apiRequest(
    current,
    "POST",
    "/v1/auth/mfa/enroll",
    { password: TEST_PASSWORD },
    token,
  );
  const secret = new URL(String(enrollment.body?.totp_uri)).searchParams.get("secret");
  assert.ok(secret, enrollment.text);
  const verified = await apiRequest(
    current,
    "POST",
    "/v1/auth/mfa/verify",
    { code: totpCode(secret) },
    token,
  );
  assert.equal(verified.status, 200, verified.text);
  const id = (
    await current.client.query<{ id: string }>(
      "SELECT id FROM mentor_profiles WHERE user_id = (SELECT id FROM users WHERE email = $1)",
      [email],
    )
  ).rows[0]?.id;
  assert.ok(id);
  return { token: String(verified.body?.session_token ?? token), profileId: id };
}

async function acceptedPair(current: TestApiStack, suffix = "") {
  const student = await studentWithProfile(current, `student.evidence${suffix}@example.com`);
  const mentor = await activeMentor(current, `mentor.evidence${suffix}@example.edu.bd`);
  const created = await apiRequest(
    current,
    "POST",
    "/v1/requests",
    {
      mentor_id: mentor.profileId,
      question: "How do I prepare for an internship interview?",
      context_summary: "Final-year CSE student with two projects.",
      target_outcome: "Pass a technical interview",
      expected_timeframe: "WITHIN_1_MONTH",
    },
    student,
  );
  assert.equal(created.status, 201, created.text);
  const accepted = await apiRequest(
    current,
    "POST",
    `/v1/requests/${created.body?.id}/accept`,
    undefined,
    mentor.token,
  );
  assert.equal(accepted.status, 200, accepted.text);
  return { student, mentor, mentorshipId: String(accepted.body?.mentorship_id) };
}

async function reportedOutcome(current: TestApiStack, suffix = ""): Promise<{
  student: string;
  mentorToken: string;
  outcomeId: string;
}> {
  const pair = await acceptedPair(current, suffix);
  const reported = await apiRequest(
    current,
    "POST",
    "/v1/outcomes",
    {
      mentorship_id: pair.mentorshipId,
      outcome_type: "INTERNSHIP",
      title: "Summer internship",
      description: "I received an internship offer after the mock interviews.",
      contribution_claimed: "DIRECTLY_ENABLED",
    },
    pair.student,
  );
  assert.equal(reported.status, 201, reported.text);
  return {
    student: pair.student,
    mentorToken: pair.mentor.token,
    outcomeId: String(reported.body?.id),
  };
}

async function createIntent(
  current: TestApiStack,
  outcomeId: string,
  token: string,
  body: Record<string, unknown>,
): Promise<HttpResult> {
  return await apiRequest(current, "POST", `/v1/outcomes/${outcomeId}/evidence`, body, token);
}

async function completeUpload(
  current: TestApiStack,
  outcomeId: string,
  evidenceId: string,
  bytes: Buffer,
  token: string,
  contentType = "application/pdf",
): Promise<HttpResult> {
  const response = await fetch(
    `${current.baseUrl}/v1/outcomes/${outcomeId}/evidence/${evidenceId}/complete`,
    {
      method: "POST",
      headers: { "content-type": contentType, authorization: `Bearer ${token}` },
      body: new Uint8Array(bytes),
    },
  );
  const text = await response.text();
  return {
    status: response.status,
    body: text ? (JSON.parse(text) as Record<string, unknown>) : undefined,
    text,
    headers: response.headers,
  };
}

async function intentFor(
  current: TestApiStack,
  outcomeId: string,
  token: string,
  bytes: Buffer = PDF,
  contentType = "application/pdf",
): Promise<string> {
  const created = await createIntent(current, outcomeId, token, {
    content_type: contentType,
    size_bytes: bytes.length,
    sha256: sha256(bytes),
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  return String(created.body?.id);
}

async function scan(
  current: TestApiStack,
  result: ScanResult = { clean: true },
): Promise<ScanJobResult> {
  return await scanQuarantinedEvidence(current.database.db, {
    storage,
    scan: async () => result,
  });
}

async function auditRows(
  current: TestApiStack,
  action: string,
): Promise<{ action: string; object_type: string; object_id: string | null }[]> {
  const rows = await current.client.query<{
    action: string;
    object_type: string;
    object_id: string | null;
  }>("SELECT action, object_type, object_id FROM audit_logs WHERE action = $1", [action]);
  return rows.rows;
}

async function attachedClean(
  current: TestApiStack,
  outcomeId: string,
  token: string,
): Promise<string> {
  const evidenceId = await intentFor(current, outcomeId, token);
  const completed = await completeUpload(current, outcomeId, evidenceId, PDF, token);
  assert.equal(completed.status, 200, completed.text);
  const result = await scan(current);
  assert.equal(result.clean, 1);
  return evidenceId;
}

test("a PDF is attached, scanned clean, and served to the student with no audit row", async (context) => {
  const current = requireStack(context);
  if (!current) return;
  const { student, outcomeId } = await reportedOutcome(current);

  const intent = await createIntent(current, outcomeId, student, {
    content_type: "application/pdf",
    size_bytes: PDF.length,
    sha256: sha256(PDF),
  });
  assert.equal(intent.status, 201, intent.text);
  assert.equal(intent.body?.status, "quarantined", "a new file is quarantined");
  assert.equal(intent.body?.url, null);

  const evidenceId = String(intent.body?.id);
  const completed = await completeUpload(current, outcomeId, evidenceId, PDF, student);
  assert.equal(completed.status, 200, completed.text);
  assert.equal(completed.body?.status, "quarantined", "the bytes do not release the file");

  const beforeScan = await apiRequest(
    current,
    "GET",
    `/v1/outcomes/${outcomeId}/evidence/${evidenceId}`,
    undefined,
    student,
  );
  assert.equal(beforeScan.status, 409, beforeScan.text);
  assert.equal(beforeScan.body?.code, "EVIDENCE_NOT_READY");

  const scanned = await scan(current);
  assert.deepEqual(scanned, { examined: 1, clean: 1, rejected: 0, failed: 0 });
  assert.equal(storage.objects.size, 1, "the object is stored, not copied");

  const read = await apiRequest(
    current,
    "GET",
    `/v1/outcomes/${outcomeId}/evidence/${evidenceId}`,
    undefined,
    student,
  );
  assert.equal(read.status, 200, read.text);
  assert.equal(read.body?.status, "clean");
  assert.match(String(read.body?.url), /^https:\/\/store\.example\//);
  assert.deepEqual(await auditRows(current, "EVIDENCE_VIEWED"), [], "a student's read is not audited");

  const outcome = await apiRequest(current, "GET", `/v1/outcomes/${outcomeId}`, undefined, student);
  assert.equal(outcome.status, 200, outcome.text);
  assert.equal(outcome.body?.evidence_tier, 1);
  const summary = outcome.body?.evidence as { id: string; status: string; sha256: string };
  assert.equal(summary.id, evidenceId);
  assert.equal(summary.status, "clean");
  assert.equal(summary.sha256, sha256(PDF));

  const events = await current.client.query<{ event_type: string; actor_role: string }>(
    "SELECT event_type, actor_role FROM outcome_events WHERE outcome_id = $1 ORDER BY seq",
    [outcomeId],
  );
  assert.deepEqual(
    events.rows.map((row) => row.event_type).slice(-1),
    ["TIER_CHANGED"],
    "a tier change is an append-only fact",
  );
  assert.equal(events.rows.at(-1)?.actor_role, "SYSTEM");

  const again = await scan(current);
  assert.equal(again.examined, 0, "a clean row is never scanned twice");
  assert.equal(
    (await current.client.query("SELECT evidence_tier FROM outcomes WHERE id = $1", [outcomeId]))
      .rows[0].evidence_tier,
    1,
    "the tier never falls on a re-scan",
  );
});

test("a second file, a bad type, a bad size, a bad digest and a wrong header are refused", async (context) => {
  const current = requireStack(context);
  if (!current) return;
  const { student, outcomeId } = await reportedOutcome(current, ".guards");
  await intentFor(current, outcomeId, student);

  const second = await createIntent(current, outcomeId, student, {
    content_type: "application/pdf",
    size_bytes: PDF.length,
    sha256: sha256(PDF),
  });
  assert.equal(second.status, 409, second.text);
  assert.equal(second.body?.code, "EVIDENCE_ALREADY_ATTACHED");

  for (const body of [
    { content_type: "text/plain", size_bytes: PDF.length, sha256: sha256(PDF) },
    { content_type: "application/pdf", size_bytes: 0, sha256: sha256(PDF) },
    { content_type: "application/pdf", size_bytes: 5 * 1024 * 1024 + 1, sha256: sha256(PDF) },
    { content_type: "application/pdf", size_bytes: PDF.length, sha256: "not-a-digest" },
  ]) {
    const refused = await createIntent(current, outcomeId, student, body);
    assert.equal(refused.status, 422, `${JSON.stringify(body)} → ${refused.text}`);
  }

  const evidenceId = (
    await current.client.query<{ id: string }>("SELECT id FROM outcome_evidence LIMIT 1")
  ).rows[0]?.id;
  const wrongHeader = await completeUpload(current, outcomeId, String(evidenceId), PDF, student, "text/plain");
  assert.equal(wrongHeader.status, 422, wrongHeader.text);
});

test("an oversize binary body is refused at 5 MiB and the JSON cap stays 100 KiB", async (context) => {
  const current = requireStack(context);
  if (!current) return;
  const { student, outcomeId } = await reportedOutcome(current, ".caps");
  const evidenceId = await intentFor(current, outcomeId, student);

  const oversize = Buffer.concat([PDF, Buffer.alloc(5 * 1024 * 1024)]);
  const refused = await completeUpload(current, outcomeId, evidenceId, oversize, student);
  assert.equal(refused.status, 413, refused.text);
  assert.equal(refused.body?.code, "PAYLOAD_TOO_LARGE");
  assert.equal(storage.objects.size, 0, "an oversize body stores nothing");

  const bigJson = await apiRequest(current, "POST", "/v1/outcomes", {
    mentorship_id: outcomeId,
    description: "x".repeat(200 * 1024),
  }, student);
  assert.equal(bigJson.status, 413, "the JSON cap is untouched by the binary exception");
});

test("bytes that do not match the declaration are rejected and never stored", async (context) => {
  const current = requireStack(context);
  if (!current) return;
  const { student, outcomeId } = await reportedOutcome(current, ".digest");
  const evidenceId = await intentFor(current, outcomeId, student);

  const other = Buffer.concat([PDF, Buffer.from("tampered\n")]);
  const completed = await completeUpload(current, outcomeId, evidenceId, other, student);
  assert.equal(completed.status, 200, completed.text);
  assert.equal(completed.body?.status, "rejected");

  assert.equal(storage.objects.size, 0, "a refused upload writes no object");
  const scanned = await scan(current);
  assert.equal(scanned.examined, 0, "a rejected row is not scanned");
  const read = await apiRequest(
    current,
    "GET",
    `/v1/outcomes/${outcomeId}/evidence/${evidenceId}`,
    undefined,
    student,
  );
  assert.equal(read.status, 409);
  const tier = await current.client.query<{ evidence_tier: number }>(
    "SELECT evidence_tier FROM outcomes WHERE id = $1",
    [outcomeId],
  );
  assert.equal(tier.rows[0]?.evidence_tier, 0);
});

test("an infected file is rejected, never served, and the tier stays 0", async (context) => {
  const current = requireStack(context);
  if (!current) return;
  const { student, outcomeId } = await reportedOutcome(current, ".infected");
  const evidenceId = await intentFor(current, outcomeId, student);
  assert.equal((await completeUpload(current, outcomeId, evidenceId, PDF, student)).status, 200);

  const scanned = await scan(current, { clean: false, signature: "Eicar-Test-Signature" });
  assert.deepEqual(scanned, { examined: 1, clean: 0, rejected: 1, failed: 0 });

  const row = await current.client.query<{ status: string; scan_detail: string }>(
    "SELECT status, scan_detail FROM outcome_evidence WHERE id = $1",
    [evidenceId],
  );
  assert.equal(row.rows[0]?.status, "REJECTED");
  assert.match(String(row.rows[0]?.scan_detail), /Eicar/);

  const read = await apiRequest(
    current,
    "GET",
    `/v1/outcomes/${outcomeId}/evidence/${evidenceId}`,
    undefined,
    student,
  );
  assert.equal(read.status, 409);
  assert.equal(read.body?.code, "EVIDENCE_NOT_READY");
  const tier = await current.client.query<{ evidence_tier: number }>(
    "SELECT evidence_tier FROM outcomes WHERE id = $1",
    [outcomeId],
  );
  assert.equal(tier.rows[0]?.evidence_tier, 0);
});

test("a stale detection never reverses a row another pass already cleared", async (context) => {
  const current = requireStack(context);
  if (!current) return;
  const { student, outcomeId } = await reportedOutcome(current, ".race");
  const evidenceId = await intentFor(current, outcomeId, student);
  assert.equal((await completeUpload(current, outcomeId, evidenceId, PDF, student)).status, 200);

  // A standing stand-in for the other pass: it clears the row while this one is
  // still fetching the bytes, so the detection below arrives too late.
  const racing: EvidenceStorage = {
    put: (key, bytes) => storage.put(key, bytes),
    presignGet: (key) => storage.presignGet(key),
    delete: (key) => storage.delete(key),
    get: async (key) => {
      await current.client.query(
        "UPDATE outcome_evidence SET status = 'CLEAN', scanned_at = now() WHERE id = $1",
        [evidenceId],
      );
      return await storage.get(key);
    },
  };
  const raced = await scanQuarantinedEvidence(current.database.db, {
    storage: racing,
    scan: async () => ({ clean: false, signature: "Eicar-Test-Signature" }),
  });

  assert.equal(raced.rejected, 0, "a late detection does not count");
  const row = await current.client.query<{ status: string }>(
    "SELECT status FROM outcome_evidence WHERE id = $1",
    [evidenceId],
  );
  assert.equal(row.rows[0]?.status, "CLEAN", "the committed result stands");
});

test("a scanner outage leaves the row quarantined, and the next pass recovers it", async (context) => {
  const current = requireStack(context);
  if (!current) return;
  const { student, outcomeId } = await reportedOutcome(current, ".outage");
  const evidenceId = await intentFor(current, outcomeId, student);
  assert.equal((await completeUpload(current, outcomeId, evidenceId, PDF, student)).status, 200);

  const failed = await scan(current, { error: "the scanner did not answer in time" });
  assert.deepEqual(failed, { examined: 1, clean: 0, rejected: 0, failed: 1 });
  const row = await current.client.query<{ status: string; scan_detail: string }>(
    "SELECT status, scan_detail FROM outcome_evidence WHERE id = $1",
    [evidenceId],
  );
  assert.equal(row.rows[0]?.status, "QUARANTINED", "an outage never releases a file");
  assert.match(String(row.rows[0]?.scan_detail), /scan failed/);
  const tier = await current.client.query<{ evidence_tier: number }>(
    "SELECT evidence_tier FROM outcomes WHERE id = $1",
    [outcomeId],
  );
  assert.equal(tier.rows[0]?.evidence_tier, 0);

  const recovered = await scan(current);
  assert.deepEqual(recovered, { examined: 1, clean: 1, rejected: 0, failed: 0 });
});

test("only the reporting student attaches, and only participants and admins read", async (context) => {
  const current = requireStack(context);
  if (!current) return;
  const { student, mentorToken, outcomeId } = await reportedOutcome(current, ".readers");
  const other = await studentWithProfile(current, "outsider.evidence@example.com");

  const mentorIntent = await createIntent(current, outcomeId, mentorToken, {
    content_type: "application/pdf",
    size_bytes: PDF.length,
    sha256: sha256(PDF),
  });
  assert.equal(mentorIntent.status, 403, mentorIntent.text);
  assert.equal(mentorIntent.body?.code, "ROLE_REQUIRED");

  const outsiderIntent = await createIntent(current, outcomeId, other, {
    content_type: "application/pdf",
    size_bytes: PDF.length,
    sha256: sha256(PDF),
  });
  assert.equal(outsiderIntent.status, 404, "a non-participant learns nothing");

  const evidenceId = await attachedClean(current, outcomeId, student);
  const mentorRead = await apiRequest(
    current,
    "GET",
    `/v1/outcomes/${outcomeId}/evidence/${evidenceId}`,
    undefined,
    mentorToken,
  );
  assert.equal(mentorRead.status, 200, mentorRead.text);
  assert.ok(mentorRead.body?.url);

  const outsiderRead = await apiRequest(
    current,
    "GET",
    `/v1/outcomes/${outcomeId}/evidence/${evidenceId}`,
    undefined,
    other,
  );
  assert.equal(outsiderRead.status, 404);
  const malformed = await apiRequest(
    current,
    "GET",
    "/v1/outcomes/not-a-uuid/evidence/also-not-a-uuid",
    undefined,
    student,
  );
  assert.equal(malformed.status, 404, "a malformed id names nothing");
  assert.deepEqual(await auditRows(current, "EVIDENCE_VIEWED"), [], "only an admin read is audited");
});

test("a platform admin read writes exactly one EVIDENCE_VIEWED row before the link", async (context) => {
  const current = requireStack(context);
  if (!current) return;
  const { student, outcomeId } = await reportedOutcome(current, ".admin");
  const evidenceId = await attachedClean(current, outcomeId, student);

  const adminEmail = "evidence.admin@example.com";
  const adminToken = await tokenFor(current, adminEmail);
  const admin = await current.client.query<{ id: string }>("SELECT id FROM users WHERE email = $1", [
    adminEmail,
  ]);
  const adminId = String(admin.rows[0]?.id);
  await current.client.query(
    "INSERT INTO role_assignments (user_id, role) VALUES ($1, 'PLATFORM_ADMIN')",
    [adminId],
  );
  await current.client.query("UPDATE users SET two_factor_enabled = true WHERE id = $1", [adminId]);

  const read = await apiRequest(
    current,
    "GET",
    `/v1/outcomes/${outcomeId}/evidence/${evidenceId}`,
    undefined,
    adminToken,
  );
  assert.equal(read.status, 200, read.text);
  assert.ok(read.body?.url);

  const rows = await current.client.query<{
    object_type: string;
    object_id: string;
    break_glass: boolean;
  }>("SELECT object_type, object_id, break_glass FROM audit_logs WHERE action = 'EVIDENCE_VIEWED'");
  assert.deepEqual(rows.rows, [
    { object_type: "outcome_evidence", object_id: evidenceId, break_glass: true },
  ]);

  const filtered = await apiRequest(
    current,
    "GET",
    "/v1/admin/audit?action=EVIDENCE_VIEWED",
    undefined,
    adminToken,
  );
  assert.equal(filtered.status, 200, filtered.text);
  assert.equal((filtered.body?.data as unknown[]).length, 1);

  // The same admin without a second factor is refused before the link exists.
  await current.client.query("UPDATE users SET two_factor_enabled = false WHERE id = $1", [adminId]);
  const noMfa = await apiRequest(
    current,
    "GET",
    `/v1/outcomes/${outcomeId}/evidence/${evidenceId}`,
    undefined,
    adminToken,
  );
  assert.equal(noMfa.status, 403, noMfa.text);
  assert.equal(noMfa.body?.code, "MFA_REQUIRED");
  assert.equal((await auditRows(current, "EVIDENCE_VIEWED")).length, 1, "no row for a refused read");
});

test("a deployment with no object store answers 503 instead of failing at boot", async (context) => {
  const current = requireStack(context);
  if (!current) return;
  const bare = await startApiStack({
    controllers: CONTROLLERS,
    requestIdRoutes: CONTROLLERS,
    providers: (database) => providers(database, null),
    // The main stack already replayed the migrations onto connect_test.
    reset: false,
  });
  if (bare.skipped) {
    context.skip(bare.reason);
    return;
  }
  try {
    const token = await tokenFor(bare.stack, "no.store@example.com");
    const refused = await apiRequest(
      bare.stack,
      "POST",
      "/v1/outcomes/00000000-0000-0000-0000-000000000000/evidence",
      { content_type: "application/pdf", size_bytes: PDF.length, sha256: sha256(PDF) },
      token,
    );
    assert.equal(refused.status, 503, refused.text);
    assert.equal(refused.body?.code, "EVIDENCE_UNAVAILABLE");
  } finally {
    await bare.stack.close();
  }
});

test("a clean tier does not move a reputation number", async (context) => {
  const current = requireStack(context);
  if (!current) return;
  const withEvidence = await reportedOutcome(current, ".tier.on");
  await attachedClean(current, withEvidence.outcomeId, withEvidence.student);
  const without = await reportedOutcome(current, ".tier.off");

  // Both outcomes are confirmed and past their cooling window, one at tier 1.
  await current.client.query(
    "UPDATE outcomes SET status = 'CONFIRMED', confirmed_at = now(), cooling_ends_at = now() - interval '1 minute' WHERE id = ANY($1::uuid[])",
    [[withEvidence.outcomeId, without.outcomeId]],
  );
  const counted = await countDueOutcomes(current.database.db);
  assert.equal(counted.counted, 2, JSON.stringify(counted));

  const ledger = await current.client.query<{ outcome_id: string; points: number; tier_multiplier: number }>(
    "SELECT outcome_id, points, tier_multiplier FROM reputation_events WHERE event_type = 'COUNTED'",
  );
  assert.equal(ledger.rows.length, 2);
  const tiers = ledger.rows.map((row) => Number(row.tier_multiplier));
  assert.deepEqual(tiers, [1, 1], "every tier multiplier is still 1.0");
  assert.equal(
    new Set(ledger.rows.map((row) => Number(row.points))).size,
    1,
    "tier 1 and tier 0 count the same points today",
  );
});

/** One outcome with a clean file, settled `daysAgo` days back (FR-PRIV-03 fixtures). */
async function settledOutcome(
  current: TestApiStack,
  suffix: string,
  status: "COUNTED" | "REJECTED",
  daysAgo: number,
): Promise<{ outcomeId: string; evidenceId: string; sha256: string }> {
  const { student, outcomeId } = await reportedOutcome(current, suffix);
  const evidenceId = await attachedClean(current, outcomeId, student);
  await current.client.query(
    status === "COUNTED"
      ? "UPDATE outcomes SET status = 'COUNTED', counted_basis = 'MENTOR_CONFIRMED', counted_at = now() - make_interval(days => $2) WHERE id = $1"
      : "UPDATE outcomes SET status = 'REJECTED', rejected_at = now() - make_interval(days => $2) WHERE id = $1",
    [outcomeId, daysAgo],
  );
  return { outcomeId, evidenceId, sha256: sha256(PDF) };
}

async function sweep(
  current: TestApiStack,
  options: { dryRun: boolean; windowDays?: number },
) {
  return await sweepExpiredEvidence(current.database.db, {
    storage,
    dryRun: options.dryRun,
    windowDays: options.windowDays ?? 90,
  });
}

async function retentionAudit(current: TestApiStack) {
  const rows = await current.client.query<{ object_id: string | null; actor_role: string }>(
    "SELECT object_id, actor_role FROM audit_logs WHERE action = 'EVIDENCE_RETENTION_DELETED'",
  );
  return rows.rows;
}

test("a counted outcome's file is deleted after the window and its metadata survives", async (context) => {
  const current = requireStack(context);
  if (!current) return;
  const settled = await settledOutcome(current, ".retain.counted", "COUNTED", 91);
  assert.equal(storage.objects.size, 1, "the file exists before the sweep");

  const first = await sweep(current, { dryRun: false });
  assert.deepEqual(first, { examined: 1, eligible: 1, deleted: 1, failed: 0, dryRun: false });
  assert.equal(storage.objects.size, 0, "the object is gone");
  assert.equal(storage.deleted.length, 1);

  const row = await current.client.query<{
    sha256: string;
    size_bytes: number;
    content_type: string;
    deleted_at: Date | null;
  }>("SELECT sha256, size_bytes, content_type, deleted_at FROM outcome_evidence WHERE id = $1", [
    settled.evidenceId,
  ]);
  assert.equal(row.rows[0]?.sha256, settled.sha256, "the hash survives the file");
  assert.equal(row.rows[0]?.size_bytes, PDF.length);
  assert.equal(row.rows[0]?.content_type, "application/pdf");
  assert.ok(row.rows[0]?.deleted_at, "the deletion instant is recorded");

  assert.deepEqual(await retentionAudit(current), [
    { object_id: settled.evidenceId, actor_role: "SYSTEM" },
  ]);

  const second = await sweep(current, { dryRun: false });
  assert.equal(second.examined, 0, "a deleted row is not even read again");
  assert.equal(second.deleted, 0, "a deleted file is not deleted again");
  assert.equal(storage.deleted.length, 1, "no second object call");
  assert.equal((await retentionAudit(current)).length, 1, "no second audit row");
});

test("a rejected outcome's file is deleted on the same clock", async (context) => {
  const current = requireStack(context);
  if (!current) return;
  await settledOutcome(current, ".retain.rejected", "REJECTED", 91);
  const result = await sweep(current, { dryRun: false });
  assert.equal(result.deleted, 1);
  assert.equal(storage.objects.size, 0);
});

test("a live outcome keeps its file, however old the row is", async (context) => {
  const current = requireStack(context);
  if (!current) return;
  const { student, outcomeId } = await reportedOutcome(current, ".retain.live");
  await attachedClean(current, outcomeId, student);

  const result = await sweep(current, { dryRun: false });
  assert.deepEqual(result, { examined: 0, eligible: 0, deleted: 0, failed: 0, dryRun: false });
  assert.equal(storage.objects.size, 1, "an unsettled outcome keeps its evidence");
});

test("the window is measured from the terminal instant, not earlier", async (context) => {
  const current = requireStack(context);
  if (!current) return;
  const settled = await settledOutcome(current, ".retain.boundary", "COUNTED", 89);

  const inside = await sweep(current, { dryRun: false });
  // The candidate query now filters on the origin itself (D-232), so a row inside
  // the window is never examined — it is not merely skipped after the re-read.
  assert.deepEqual(inside, { examined: 0, eligible: 0, deleted: 0, failed: 0, dryRun: false });
  assert.equal(storage.objects.size, 1, "one day inside the window is untouched");

  await current.client.query(
    "UPDATE outcomes SET counted_at = now() - make_interval(days => 90) WHERE id = $1",
    [settled.outcomeId],
  );
  const atBoundary = await sweep(current, { dryRun: false });
  assert.equal(atBoundary.deleted, 1, "the boundary itself is due");
});

test("a store failure leaves the row eligible and does not stop the batch", async (context) => {
  const current = requireStack(context);
  if (!current) return;
  const failing = await settledOutcome(current, ".retain.fail", "COUNTED", 91);
  const fine = await settledOutcome(current, ".retain.pass", "COUNTED", 95);
  const failingKey = (
    await current.client.query<{ object_key: string }>(
      "SELECT object_key FROM outcome_evidence WHERE id = $1",
      [failing.evidenceId],
    )
  ).rows[0]?.object_key;
  assert.ok(failingKey);
  storage.failDelete = new Set([failingKey]);

  const result = await sweep(current, { dryRun: false });
  assert.equal(result.failed, 1);
  assert.equal(result.deleted, 1, "the other file still goes");

  const rows = await current.client.query<{ id: string; deleted_at: Date | null }>(
    "SELECT id, deleted_at FROM outcome_evidence ORDER BY id",
  );
  const failedRow = rows.rows.find((row) => row.id === failing.evidenceId);
  assert.equal(failedRow?.deleted_at, null, "the failed row keeps deleted_at null");
  assert.deepEqual(
    (await retentionAudit(current)).map((row) => row.object_id),
    [fine.evidenceId],
    "no audit row claims the failed deletion",
  );
});

test("a dry run reports what it would delete and changes nothing", async (context) => {
  const current = requireStack(context);
  if (!current) return;
  const settled = await settledOutcome(current, ".retain.dry", "COUNTED", 91);

  const report = await sweep(current, { dryRun: true });
  assert.deepEqual(report, { examined: 1, eligible: 1, deleted: 0, failed: 0, dryRun: true });
  assert.equal(storage.objects.size, 1, "nothing is deleted");
  assert.equal(storage.deleted.length, 0, "no object call at all");
  assert.deepEqual(await retentionAudit(current), [], "no audit row in dry run");
  const row = await current.client.query<{ deleted_at: Date | null }>(
    "SELECT deleted_at FROM outcome_evidence WHERE id = $1",
    [settled.evidenceId],
  );
  assert.equal(row.rows[0]?.deleted_at, null, "the row is unchanged");
});

test("a reversal and an intent with no bytes both keep their file", async (context) => {
  const current = requireStack(context);
  if (!current) return;
  const reversed = await settledOutcome(current, ".retain.reversed", "COUNTED", 91);
  await current.client.query("UPDATE outcomes SET status = 'REVERSED' WHERE id = $1", [
    reversed.outcomeId,
  ]);

  // An intent whose bytes never landed: no object exists, and the sweep ignores it.
  const pending = await reportedOutcome(current, ".retain.intent");
  await current.client.query(
    "INSERT INTO outcome_evidence (outcome_id, uploaded_by_user_id, object_key, sha256, size_bytes, content_type) SELECT $1, sp.user_id, $2, repeat('b', 64), 4, 'application/pdf' FROM outcomes o JOIN student_profiles sp ON sp.id = o.student_profile_id WHERE o.id = $1",
    [pending.outcomeId, `outcome-evidence/${pending.outcomeId}/intent-probe`],
  );
  await current.client.query(
    "UPDATE outcomes SET status = 'COUNTED', counted_basis = 'MENTOR_CONFIRMED', counted_at = now() - make_interval(days => 120) WHERE id = $1",
    [pending.outcomeId],
  );

  const result = await sweep(current, { dryRun: false });
  assert.deepEqual(result, { examined: 0, eligible: 0, deleted: 0, failed: 0, dryRun: false });
  assert.equal(storage.objects.size, 1, "the reversed outcome keeps its file");
  assert.deepEqual(await retentionAudit(current), []);
});

test("the retention action is filterable in the audit log", async (context) => {
  const current = requireStack(context);
  if (!current) return;
  await settledOutcome(current, ".retain.audit", "COUNTED", 91);
  await sweep(current, { dryRun: false });

  const adminEmail = "retention.admin@example.com";
  const adminToken = await tokenFor(current, adminEmail);
  const admin = await current.client.query<{ id: string }>("SELECT id FROM users WHERE email = $1", [
    adminEmail,
  ]);
  const adminId = String(admin.rows[0]?.id);
  await current.client.query(
    "INSERT INTO role_assignments (user_id, role) VALUES ($1, 'PLATFORM_ADMIN')",
    [adminId],
  );
  await current.client.query("UPDATE users SET two_factor_enabled = true WHERE id = $1", [adminId]);

  const filtered = await apiRequest(
    current,
    "GET",
    "/v1/admin/audit?action=EVIDENCE_RETENTION_DELETED",
    undefined,
    adminToken,
  );
  assert.equal(filtered.status, 200, filtered.text);
  assert.equal((filtered.body?.data as unknown[]).length, 1);
});

/** A settled outcome whose file is attached, moving through COUNTED first. */
async function reversalOrWithdrawal(
  current: TestApiStack,
  suffix: string,
  status: "REVERSED" | "WITHDRAWN",
  settledDaysAgo: number,
  countedDaysAgo = 200,
): Promise<{ outcomeId: string; evidenceId: string; student: string }> {
  const { student, outcomeId } = await reportedOutcome(current, suffix);
  const evidenceId = await attachedClean(current, outcomeId, student);
  await current.client.query(
    "UPDATE outcomes SET status = 'COUNTED', counted_basis = 'MENTOR_CONFIRMED', counted_at = now() - make_interval(days => $2), confirmed_at = now() - make_interval(days => $2) WHERE id = $1",
    [outcomeId, countedDaysAgo],
  );
  await current.client.query(
    status === "REVERSED"
      ? "UPDATE outcomes SET status = 'REVERSED', reversed_at = now() - make_interval(days => $2) WHERE id = $1"
      : "UPDATE outcomes SET status = 'WITHDRAWN', withdrawn_at = now() - make_interval(days => $2) WHERE id = $1",
    [outcomeId, settledDaysAgo],
  );
  return { outcomeId, evidenceId, student };
}

/** One institution-sharing withdrawal, by the reporting student or by the mentor. */
async function withdrawSharing(
  current: TestApiStack,
  outcomeId: string,
  daysAgo: number,
  who: "student" | "mentor",
): Promise<void> {
  const join =
    who === "student"
      ? "JOIN student_profiles sp ON sp.id = o.student_profile_id"
      : "JOIN mentor_profiles mp ON mp.id = o.mentor_profile_id";
  const column = who === "student" ? "sp.user_id" : "mp.user_id";
  await current.client.query(
    `INSERT INTO consent_records (user_id, purpose, action, document_version, occurred_at)
     SELECT ${column}, 'INSTITUTION_DATA_SHARING', 'WITHDRAWN', '2026-11', now() - make_interval(days => $2)
       FROM outcomes o ${join} WHERE o.id = $1`,
    [outcomeId, daysAgo],
  );
}

test("a reversal starts its own clock: a year-old count reversed yesterday keeps its file", async (context) => {
  const current = requireStack(context);
  if (!current) return;
  await reversalOrWithdrawal(current, ".reverse.young", "REVERSED", 1, 365);

  const result = await sweep(current, { dryRun: false });
  assert.deepEqual(result, { examined: 0, eligible: 0, deleted: 0, failed: 0, dryRun: false });
  assert.equal(storage.objects.size, 1, "the material the clawback was decided on survives");
});

test("a reversal past the window deletes the file and keeps the metadata", async (context) => {
  const current = requireStack(context);
  if (!current) return;
  const settled = await reversalOrWithdrawal(current, ".reverse.old", "REVERSED", 91);

  const result = await sweep(current, { dryRun: false });
  assert.deepEqual(result, { examined: 1, eligible: 1, deleted: 1, failed: 0, dryRun: false });
  assert.equal(storage.objects.size, 0);
  const row = await current.client.query<{ sha256: string; deleted_at: Date | null }>(
    "SELECT sha256, deleted_at FROM outcome_evidence WHERE id = $1",
    [settled.evidenceId],
  );
  assert.equal(row.rows[0]?.sha256, sha256(PDF), "the hash survives the file");
  assert.ok(row.rows[0]?.deleted_at);
  assert.deepEqual(await retentionAudit(current), [
    { object_id: settled.evidenceId, actor_role: "SYSTEM" },
  ]);
});

test("a withdrawal past the window deletes on withdrawn_at", async (context) => {
  const current = requireStack(context);
  if (!current) return;
  await reversalOrWithdrawal(current, ".withdraw.old", "WITHDRAWN", 91, 200);

  const result = await sweep(current, { dryRun: false });
  assert.equal(result.deleted, 1);
  assert.equal(storage.objects.size, 0);
});

test("an earlier institution-sharing withdrawal brings a counted outcome due", async (context) => {
  const current = requireStack(context);
  if (!current) return;
  const settled = await settledOutcome(current, ".consent.early", "COUNTED", 10);
  await withdrawSharing(current, settled.outcomeId, 100, "student");

  const result = await sweep(current, { dryRun: false });
  assert.equal(result.deleted, 1, "the withdrawal instant starts the clock sooner");
  assert.equal(storage.objects.size, 0);
});

test("a later withdrawal changes nothing", async (context) => {
  const current = requireStack(context);
  if (!current) return;
  const settled = await settledOutcome(current, ".consent.late", "COUNTED", 10);
  await withdrawSharing(current, settled.outcomeId, 5, "student");

  const result = await sweep(current, { dryRun: false });
  assert.equal(result.examined, 0);
  assert.equal(storage.objects.size, 1);
});

test("only the reporting student's withdrawal counts", async (context) => {
  const current = requireStack(context);
  if (!current) return;
  const settled = await settledOutcome(current, ".consent.mentor", "COUNTED", 10);
  await withdrawSharing(current, settled.outcomeId, 100, "mentor");

  const result = await sweep(current, { dryRun: false });
  assert.equal(result.examined, 0, "the mentor's own consent is not the student's");
  assert.equal(storage.objects.size, 1);
});

test("a settled row with a null matching instant is never due", async (context) => {
  const current = requireStack(context);
  if (!current) return;
  const { student, outcomeId } = await reportedOutcome(current, ".null.instant");
  await attachedClean(current, outcomeId, student);
  await current.client.query(
    "UPDATE outcomes SET status = 'REVERSED', reversed_at = NULL, counted_at = now() - interval '400 days' WHERE id = $1",
    [outcomeId],
  );

  const result = await sweep(current, { dryRun: false });
  assert.equal(result.examined, 0);
  assert.equal(storage.objects.size, 1);
});

test("the dry run reports the new eligible rows and deletes nothing", async (context) => {
  const current = requireStack(context);
  if (!current) return;
  await reversalOrWithdrawal(current, ".dry.reverse", "REVERSED", 91);
  await reversalOrWithdrawal(current, ".dry.withdraw", "WITHDRAWN", 91);

  const result = await sweep(current, { dryRun: true });
  assert.deepEqual(result, { examined: 2, eligible: 2, deleted: 0, failed: 0, dryRun: true });
  assert.equal(storage.objects.size, 2);
  assert.deepEqual(await retentionAudit(current), []);
});
