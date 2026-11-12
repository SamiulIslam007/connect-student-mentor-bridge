"use client";

import { useEffect, useState } from "react";

import {
  INSTITUTION_KIND_OPTIONS,
  createInstitutionBody,
  institutionRows,
  institutionSummary,
  type InstitutionDraft,
  type InstitutionRow,
} from "../../../lib/institutions";
import { strings } from "../../../lib/strings";

type PageState = "loading" | "ready" | "error" | "signed-out" | "mfa-required";

const EMPTY_DRAFT: InstitutionDraft = {
  name: "",
  kind: "UNIVERSITY",
  countryCode: "",
  mouSignedOn: "",
  domains: "",
};

export default function AdminInstitutionsPage() {
  const [state, setState] = useState<PageState>("loading");
  const [rows, setRows] = useState<InstitutionRow[]>([]);
  const [draft, setDraft] = useState<InstitutionDraft>(EMPTY_DRAFT);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;

    async function load(): Promise<void> {
      try {
        const response = await fetch("/api/institutions");
        if (!active) {
          return;
        }
        if (response.status === 401) {
          setState("signed-out");
          return;
        }
        const payload = (await response.json().catch(() => ({}))) as {
          code?: string;
        };
        if (response.status === 403 && payload.code === "MFA_REQUIRED") {
          setState("mfa-required");
          return;
        }
        if (!response.ok) {
          setState("error");
          return;
        }
        setRows(institutionRows(payload));
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

  async function create(): Promise<void> {
    const checked = createInstitutionBody(draft);
    if (!checked.ok) {
      setMessage(checked.error);
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/institutions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(checked.body),
      });
      if (response.status === 409) {
        setMessage(strings.adminInstitutions.duplicateDomain);
        return;
      }
      if (!response.ok) {
        setMessage(strings.adminInstitutions.createError);
        return;
      }
      const created = institutionRows({ data: [await response.json()] });
      setRows((current) =>
        [...current, ...created].sort((left, right) =>
          left.name.localeCompare(right.name) || left.id.localeCompare(right.id),
        ),
      );
      setDraft(EMPTY_DRAFT);
      setMessage(strings.adminInstitutions.created);
    } catch {
      setMessage(strings.adminInstitutions.createError);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main>
      <h1>{strings.adminInstitutions.title}</h1>
      <p>{strings.adminInstitutions.intro}</p>

      <p role="status">
        {state === "loading"
          ? strings.adminInstitutions.loading
          : state === "error"
            ? strings.adminInstitutions.loadError
            : state === "signed-out"
              ? strings.adminInstitutions.signedOut
              : state === "mfa-required"
                ? strings.adminInstitutions.mfaRequired
                : null}
      </p>

      {state === "ready" && rows.length === 0 ? <p>{strings.adminInstitutions.empty}</p> : null}

      {state === "ready" && rows.length > 0 ? (
        <ul>
          {rows.map((row) => (
            <li key={row.id}>
              <p>
                <strong>{row.name}</strong>
              </p>
              <p>{institutionSummary(row)}</p>
              <p>{row.mou_signed_on ? `MoU ${row.mou_signed_on}` : null}</p>
            </li>
          ))}
        </ul>
      ) : null}

      <section>
        <h2>{strings.adminInstitutions.createTitle}</h2>
        <p>{strings.adminInstitutions.createHelp}</p>
        <p>
          <label>
            {strings.adminInstitutions.nameLabel}
            <input
              value={draft.name}
              maxLength={160}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            />
          </label>
        </p>
        <p>
          <label>
            {strings.adminInstitutions.kindLabel}
            <select
              value={draft.kind}
              onChange={(event) => setDraft({ ...draft, kind: event.target.value })}
            >
              {INSTITUTION_KIND_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </p>
        <p>
          <label>
            {strings.adminInstitutions.countryLabel}
            <input
              value={draft.countryCode}
              maxLength={2}
              onChange={(event) => setDraft({ ...draft, countryCode: event.target.value })}
            />
          </label>
        </p>
        <p>
          <label>
            {strings.adminInstitutions.mouLabel}
            <input
              value={draft.mouSignedOn}
              placeholder="YYYY-MM-DD"
              onChange={(event) => setDraft({ ...draft, mouSignedOn: event.target.value })}
            />
          </label>
        </p>
        <p>
          <label>
            {strings.adminInstitutions.domainsLabel}
            <input
              value={draft.domains}
              onChange={(event) => setDraft({ ...draft, domains: event.target.value })}
            />
          </label>
        </p>
        <button type="button" disabled={busy} onClick={() => void create()}>
          {strings.adminInstitutions.create}
        </button>
      </section>

      <p role="status">{message}</p>
    </main>
  );
}
