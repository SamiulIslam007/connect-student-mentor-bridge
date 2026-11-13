"use client";

import { useEffect, useState } from "react";

import {
  CONSENT_PURPOSES,
  labelFor,
  purposesForContext,
  stateTextFor,
  type ConsentState,
  type ConsentPurpose,
} from "../../lib/consents";
import { strings } from "../../lib/strings";

interface ConsentsPayload {
  purposes: ConsentState[];
  institutions: { id: string; name: string }[];
}

interface Me {
  mentor_profile?: unknown;
}

/**
 * `/consent` — one section per purpose the caller can hold (design R7). Accept
 * and withdraw both append a record; nothing here blocks another route.
 */
export default function ConsentPage() {
  const [states, setStates] = useState<ConsentState[]>([]);
  const [institutions, setInstitutions] = useState<{ id: string; name: string }[]>([]);
  const [institutionId, setInstitutionId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isMentor, setIsMentor] = useState(false);

  useEffect(() => {
    let active = true;

    async function load(): Promise<void> {
      try {
        const [consentsResponse, meResponse] = await Promise.all([
          fetch("/api/me/consents"),
          fetch("/api/me"),
        ]);
        if (!active) {
          return;
        }
        if (consentsResponse.status === 401) {
          setMessage(strings.consent.signedOut);
          setLoading(false);
          return;
        }
        if (!consentsResponse.ok) {
          setMessage(strings.consent.loadError);
          setLoading(false);
          return;
        }
        const payload = (await consentsResponse.json()) as ConsentsPayload;
        setStates(payload.purposes);
        setInstitutions(payload.institutions);
        setInstitutionId(payload.institutions[0]?.id ?? "");
        if (meResponse.ok) {
          const me = (await meResponse.json()) as Me;
          setIsMentor(me.mentor_profile !== undefined && me.mentor_profile !== null);
        }
        setLoading(false);
      } catch {
        if (active) {
          setMessage(strings.consent.loadError);
          setLoading(false);
        }
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, []);

  const visible = purposesForContext({ isMentor, hasAffiliation: institutions.length > 0 });

  async function record(purpose: ConsentPurpose, action: "GRANTED" | "WITHDRAWN"): Promise<void> {
    setBusy(`${purpose}:${action}`);
    setMessage(null);
    const state = states.find((candidate) => candidate.purpose === purpose);
    const body: Record<string, unknown> = {
      purpose,
      action,
      document_version: state?.current_version ?? "",
    };
    if (purpose === "INSTITUTION_DATA_SHARING") {
      body.institution_id = institutionId;
    }
    try {
      const response = await fetch("/api/me/consents", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (response.status === 401) {
        setMessage(strings.consent.signedOut);
      } else if (response.ok) {
        const recorded = (await response.json()) as { purpose: string; action: string };
        setStates((current) =>
          current.map((candidate) =>
            candidate.purpose === recorded.purpose
              ? {
                  ...candidate,
                  action: recorded.action,
                  accepted_version:
                    recorded.action === "GRANTED" ? candidate.current_version : null,
                  institution_id: purpose === "INSTITUTION_DATA_SHARING" ? institutionId : null,
                }
              : candidate,
          ),
        );
        setMessage(strings.consent.recorded);
      } else {
        setMessage(strings.consent.failed);
      }
    } catch {
      // The failure stays visible and the buttons stay usable.
      setMessage(strings.consent.failed);
    } finally {
      setBusy(null);
    }
  }

  if (loading) {
    return <p>{strings.consent.loading}</p>;
  }

  return (
    <main>
      <h1>{strings.consent.title}</h1>
      <p>{strings.consent.intro}</p>
      {message ? <p role="status">{message}</p> : null}
      {visible.map((purpose) => {
        const state =
          states.find((candidate) => candidate.purpose === purpose) ??
          ({
            purpose,
            current_version: "",
            accepted_version: null,
            action: null,
            institution_id: null,
          } as ConsentState);
        const accepted = state.action === "GRANTED";
        return (
          <section key={purpose} aria-labelledby={`consent-${purpose}`}>
            <h2 id={`consent-${purpose}`}>{labelFor(purpose)}</h2>
            <p>{stateTextFor(state)}</p>
            <p>
              {strings.consent.currentVersion}: {state.current_version}
              {state.accepted_version ? (
                <>
                  {" · "}
                  {strings.consent.acceptedAt}: {state.accepted_version}
                </>
              ) : null}
            </p>
            {purpose === "INSTITUTION_DATA_SHARING" && institutions.length > 1 ? (
              <label>
                {strings.consent.institution}
                <select
                  value={institutionId}
                  onChange={(event) => setInstitutionId(event.target.value)}
                >
                  {institutions.map((institution) => (
                    <option key={institution.id} value={institution.id}>
                      {institution.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <button
              type="button"
              disabled={busy !== null || accepted}
              onClick={() => void record(purpose, "GRANTED")}
            >
              {strings.consent.accept}
            </button>
            <button
              type="button"
              disabled={busy !== null || !accepted}
              onClick={() => void record(purpose, "WITHDRAWN")}
            >
              {strings.consent.withdraw}
            </button>
          </section>
        );
      })}
      <p>{CONSENT_PURPOSES.length} purposes are published.</p>
    </main>
  );
}
