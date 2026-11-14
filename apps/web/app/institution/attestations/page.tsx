"use client";

import { useEffect, useState } from "react";

import { claimLine, decisionBody, readClaims, type ClaimDecision, type PendingClaim } from "../../../lib/attestations";
import { strings } from "../../../lib/strings";
import { csrfFetch } from "../../../lib/csrf-client";

type PageState = "loading" | "ready" | "error" | "signed-out" | "mfa-required";

export default function InstitutionAttestationsPage() {
  const [state, setState] = useState<PageState>("loading");
  const [claims, setClaims] = useState<PendingClaim[]>([]);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function load(): Promise<void> {
      try {
        const response = await fetch("/api/institution/attestations");
        if (!active) {
          return;
        }
        if (response.status === 401) {
          setState("signed-out");
          return;
        }
        const payload = (await response.json().catch(() => ({}))) as {
          code?: string;
          data?: unknown;
        };
        if (response.status === 403 && payload.code === "MFA_REQUIRED") {
          setState("mfa-required");
          return;
        }
        if (!response.ok) {
          setState("error");
          return;
        }
        setClaims(readClaims(payload as { data?: PendingClaim[] }));
        setState("ready");
      } catch {
        if (active) {
          setState("error");
        }
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, []);

  async function decide(claimId: string, decision: ClaimDecision): Promise<void> {
    const prepared = decisionBody(decision, reasons[claimId] ?? "");
    if (!prepared.ok) {
      setMessage(prepared.message);
      return;
    }

    setBusy(claimId);
    setMessage(null);
    try {
      const response = await csrfFetch(`/api/institution/attestations/${claimId}/decide`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(prepared.body),
      });
      const payload = (await response.json().catch(() => ({}))) as { code?: string };
      if (!response.ok) {
        // A refusal (409 already decided, 404 out of scope) is shown, never a crash.
        setMessage(payload.code ? `${strings.attestations.decideError} (${payload.code})` : strings.attestations.decideError);
        return;
      }
      setClaims((rows) => rows.filter((row) => row.id !== claimId));
      setMessage(
        decision === "verify" ? strings.attestations.verified : strings.attestations.rejected,
      );
    } catch {
      setMessage(strings.attestations.decideError);
    } finally {
      setBusy(null);
    }
  }

  return (
    <main>
      <h1>{strings.attestations.title}</h1>
      <p>{strings.attestations.intro}</p>

      <p role="status">
        {state === "loading" ? strings.attestations.loading : null}
        {state === "signed-out" ? strings.attestations.signedOut : null}
        {state === "mfa-required" ? strings.attestations.mfaRequired : null}
        {state === "error" ? strings.attestations.error : null}
        {message}
      </p>

      {state === "ready" && claims.length === 0 ? <p>{strings.attestations.empty}</p> : null}

      {claims.length > 0 ? (
        <ul>
          {claims.map((claim) => (
            <li key={claim.id}>
              <p>{claimLine(claim)}</p>
              <label>
                {strings.attestations.reason}
                <input
                  type="text"
                  value={reasons[claim.id] ?? ""}
                  onChange={(event) =>
                    setReasons((current) => ({ ...current, [claim.id]: event.target.value }))
                  }
                />
              </label>{" "}
              <button type="button" disabled={busy === claim.id} onClick={() => void decide(claim.id, "verify")}>
                {strings.attestations.verify}
              </button>{" "}
              <button type="button" disabled={busy === claim.id} onClick={() => void decide(claim.id, "reject")}>
                {strings.attestations.reject}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <p>
        <a href="/account">{strings.attestations.backToAccount}</a>
      </p>
    </main>
  );
}
