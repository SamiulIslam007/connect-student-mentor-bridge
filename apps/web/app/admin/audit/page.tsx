"use client";

import { useCallback, useEffect, useState } from "react";

import {
  buildAuditQuery,
  breakGlassMarker,
  emptyFilters,
  filtersFromQuery,
  occurredAtText,
  reasonText,
  type AuditFilters,
  type AuditRow,
} from "../../../lib/audit";
import { strings } from "../../../lib/strings";

type PageState = "loading" | "ready" | "error" | "signed-out" | "mfa-required";

interface AuditPayload {
  code?: string;
  detail?: string;
  data?: AuditRow[];
  next_cursor?: string | null;
}

export default function AdminAuditPage() {
  const [state, setState] = useState<PageState>("loading");
  const [filters, setFilters] = useState<AuditFilters>(emptyFilters());
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (next: AuditFilters): Promise<void> => {
    setState("loading");
    setMessage(null);
    try {
      const response = await fetch(`/api/admin/audit${buildAuditQuery(next)}`);
      if (response.status === 401) {
        setState("signed-out");
        return;
      }
      const payload = (await response.json().catch(() => ({}))) as AuditPayload;
      if (response.status === 403 && payload.code === "MFA_REQUIRED") {
        setState("mfa-required");
        return;
      }
      if (!response.ok) {
        // A refused filter names its parameter; that detail is the whole message.
        setMessage(payload.detail ?? strings.audit.loadError);
        setState("error");
        return;
      }
      setRows(payload.data ?? []);
      setCursor(payload.next_cursor ?? null);
      setState("ready");
    } catch {
      setState("error");
    }
  }, []);

  useEffect(() => {
    const initial = filtersFromQuery(window.location.search);
    setFilters(initial);
    void load(initial);
  }, [load]);

  async function loadMore(): Promise<void> {
    if (!cursor) {
      return;
    }
    setBusy(true);
    try {
      const response = await fetch(`/api/admin/audit${buildAuditQuery(filters, cursor)}`);
      const payload = (await response.json().catch(() => ({}))) as AuditPayload;
      if (!response.ok) {
        setMessage(payload.detail ?? strings.audit.loadError);
        return;
      }
      setRows((current) => [...current, ...(payload.data ?? [])]);
      setCursor(payload.next_cursor ?? null);
    } catch {
      setMessage(strings.audit.loadError);
    } finally {
      setBusy(false);
    }
  }

  function apply(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    // The URL is the filter state, so a colleague can open the same view (R6).
    window.location.assign(`/admin/audit${buildAuditQuery(filters)}`);
  }

  return (
    <main>
      <h1>{strings.audit.title}</h1>
      <p>{strings.audit.intro}</p>

      <form onSubmit={apply}>
        <label>
          {strings.audit.actorLabel}
          <input
            value={filters.actor}
            onChange={(event) => setFilters({ ...filters, actor: event.target.value })}
          />
        </label>
        <label>
          {strings.audit.actionLabel}
          <input
            value={filters.action}
            onChange={(event) => setFilters({ ...filters, action: event.target.value })}
          />
        </label>
        <label>
          {strings.audit.objectTypeLabel}
          <input
            value={filters.object_type}
            onChange={(event) => setFilters({ ...filters, object_type: event.target.value })}
          />
        </label>
        <label>
          {strings.audit.objectIdLabel}
          <input
            value={filters.object_id}
            onChange={(event) => setFilters({ ...filters, object_id: event.target.value })}
          />
        </label>
        <label>
          {strings.audit.fromLabel}
          <input
            type="date"
            value={filters.from}
            onChange={(event) => setFilters({ ...filters, from: event.target.value })}
          />
        </label>
        <label>
          {strings.audit.toLabel}
          <input
            type="date"
            value={filters.to}
            onChange={(event) => setFilters({ ...filters, to: event.target.value })}
          />
        </label>
        <button type="submit">{strings.audit.apply}</button>
      </form>

      {state === "loading" ? <p role="status">{strings.audit.loading}</p> : null}
      {state === "error" ? <p role="alert">{message ?? strings.audit.loadError}</p> : null}
      {state === "signed-out" ? <p>{strings.audit.signedOut}</p> : null}
      {state === "mfa-required" ? <p role="alert">{strings.audit.mfaRequired}</p> : null}
      {state === "ready" && rows.length === 0 ? <p>{strings.audit.empty}</p> : null}

      {state === "ready" && rows.length > 0 ? (
        <table>
          <thead>
            <tr>
              <th scope="col">{strings.audit.columnWhen}</th>
              <th scope="col">{strings.audit.columnActor}</th>
              <th scope="col">{strings.audit.columnAction}</th>
              <th scope="col">{strings.audit.columnObject}</th>
              <th scope="col">{strings.audit.columnReason}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{occurredAtText(row)}</td>
                <td>
                  {row.actor_user_id ?? strings.audit.systemActor} · {row.actor_role}
                </td>
                <td>
                  {row.action}
                  {breakGlassMarker(row) ? <strong> {breakGlassMarker(row)}</strong> : null}
                </td>
                <td>
                  {row.object_type}
                  {row.object_id ? ` · ${row.object_id}` : null}
                </td>
                <td>{reasonText(row)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}

      {state === "ready" && cursor ? (
        <button type="button" disabled={busy} onClick={() => void loadMore()}>
          {busy ? strings.audit.loadingMore : strings.audit.loadMore}
        </button>
      ) : null}

      <p>
        <a href="/account">{strings.account.backToAccount}</a>
      </p>
    </main>
  );
}
