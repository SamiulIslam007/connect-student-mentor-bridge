/**
 * The institution attestation queue's client shapes and formatting. The page
 * stays a thin caller, so every rule that can be tested lives here.
 */

export interface PendingClaim {
  id: string;
  display_name: string;
  email_domain: string | null;
  kind: string;
  department: string | null;
  program: string | null;
  batch_year: number | null;
  claimed_at: string;
}

export interface ClaimQueuePayload {
  data?: PendingClaim[];
}

export type ClaimDecision = "verify" | "reject";

/** Why a decision body was refused before any request was made. */
export const EMPTY_REASON_MESSAGE = "Enter a reason before deciding this claim.";

/** An absent or malformed payload reads as an empty queue, never as an error. */
export function readClaims(payload: { data?: unknown } | null | undefined): PendingClaim[] {
  const rows = payload?.data;
  return Array.isArray(rows)
    ? rows.filter(
        (row): row is PendingClaim =>
          typeof row === "object" &&
          row !== null &&
          typeof (row as PendingClaim).id === "string" &&
          typeof (row as PendingClaim).display_name === "string",
      )
    : [];
}

/** The one-line summary a reviewer reads: facts the claim itself declares. */
export function claimLine(claim: PendingClaim): string {
  return [
    claim.display_name,
    claim.email_domain ?? "",
    claim.kind,
    claim.department ?? "",
    claim.program ?? "",
    claim.batch_year === null ? "" : String(claim.batch_year),
  ]
    .filter((part) => part.length > 0)
    .join(" · ");
}

export type DecisionBody =
  | { ok: true; body: { decision: ClaimDecision; reason: string } }
  | { ok: false; message: string };

/** A reason is required on both decisions; nothing is sent without one. */
export function decisionBody(decision: ClaimDecision, reason: string): DecisionBody {
  const trimmed = reason.trim();
  if (!trimmed) {
    return { ok: false, message: EMPTY_REASON_MESSAGE };
  }
  return { ok: true, body: { decision, reason: trimmed } };
}
