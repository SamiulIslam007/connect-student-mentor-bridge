"use client";

import { useEffect, useState } from "react";

import { targetKindLabel } from "../../../lib/reports";
import { strings } from "../../../lib/strings";

type PageState = "loading" | "ready" | "error" | "signed-out" | "mfa-required";

interface ReportRow {
  id: string;
  target_kind: string;
  target_id: string;
  reason: string;
  details: string | null;
  status: string;
  created_at: string;
}

export default function AdminReportsPage() {
  const [state, setState] = useState<PageState>("loading");
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [decisions, setDecisions] = useState<Record<string, string>>({});
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [suspendId, setSuspendId] = useState("");
  const [suspendReason, setSuspendReason] = useState("");
  const [suspendEnd, setSuspendEnd] = useState("");

  useEffect(() => {
    let active = true;

    async function load(): Promise<void> {
      try {
        const response = await fetch("/api/admin/reports");
        if (!active) {
          return;
        }
        if (response.status === 401) {
          setState("signed-out");
          return;
        }
        const payload = (await response.json().catch(() => ({}))) as {
          code?: string;
          data?: ReportRow[];
        };
        if (response.status === 403 && payload.code === "MFA_REQUIRED") {
          setState("mfa-required");
          return;
        }
        if (!response.ok) {
          setState("error");
          return;
        }
        setReports(payload.data ?? []);
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

  async function resolve(reportId: string): Promise<void> {
    const decision = decisions[reportId] ?? "actioned";
    const reason = (reasons[reportId] ?? "").trim();
    if (!reason) {
      setMessage(strings.adminReports.reasonLabel);
      return;
    }
    setBusy(reportId);
    try {
      const response = await fetch(`/api/admin/reports/${reportId}/resolve`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ decision, reason }),
      });
      if (response.status === 409) {
        setMessage(strings.adminReports.alreadyResolved);
        return;
      }
      if (!response.ok) {
        setMessage(strings.adminReports.resolveError);
        return;
      }
      setReports((rows) => rows.filter((row) => row.id !== reportId));
      setMessage(strings.adminReports.resolved);
    } catch {
      setMessage(strings.adminReports.resolveError);
    } finally {
      setBusy(null);
    }
  }

  async function suspend(): Promise<void> {
    const id = suspendId.trim();
    if (!id || !suspendReason.trim()) {
      setMessage(strings.adminReports.suspendError);
      return;
    }
    setBusy("suspend");
    try {
      const response = await fetch(`/api/admin/accounts/${encodeURIComponent(id)}/suspend`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          reason: suspendReason.trim(),
          ...(suspendEnd.trim() ? { end_date: suspendEnd.trim() } : {}),
        }),
      });
      if (!response.ok) {
        setMessage(strings.adminReports.suspendError);
        return;
      }
      setSuspendId("");
      setSuspendReason("");
      setSuspendEnd("");
      setMessage(strings.adminReports.suspended);
    } catch {
      setMessage(strings.adminReports.suspendError);
    } finally {
      setBusy(null);
    }
  }

  return (
    <main>
      <h1>{strings.adminReports.title}</h1>
      <p>{strings.adminReports.intro}</p>

      <p role="status">
        {state === "loading"
          ? strings.adminReports.loading
          : state === "error"
            ? strings.adminReports.loadError
            : state === "signed-out"
              ? strings.adminReports.signedOut
              : state === "mfa-required"
                ? strings.adminReports.mfaRequired
                : null}
      </p>

      {state === "ready" && reports.length === 0 ? <p>{strings.adminReports.empty}</p> : null}

      {state === "ready" && reports.length > 0 ? (
        <ul>
          {reports.map((report) => (
            <li key={report.id}>
              <p>
                <strong>{targetKindLabel(report.target_kind)}</strong> · {report.reason} ·{" "}
                {report.created_at.slice(0, 16).replace("T", " ")}
              </p>
              <p>{report.target_id}</p>
              {report.details ? <p>{report.details}</p> : null}
              <p>
                <label>
                  {strings.adminReports.resolveLabel}{" "}
                  <select
                    value={decisions[report.id] ?? "actioned"}
                    onChange={(event) =>
                      setDecisions((current) => ({ ...current, [report.id]: event.target.value }))
                    }
                  >
                    <option value="actioned">{strings.adminReports.resolveActioned}</option>
                    <option value="dismissed">{strings.adminReports.resolveDismissed}</option>
                  </select>
                </label>
              </p>
              <p>
                <label>
                  {strings.adminReports.reasonLabel}
                  <input
                    value={reasons[report.id] ?? ""}
                    maxLength={1000}
                    onChange={(event) =>
                      setReasons((current) => ({ ...current, [report.id]: event.target.value }))
                    }
                  />
                </label>
              </p>
              <button
                type="button"
                disabled={busy === report.id}
                onClick={() => void resolve(report.id)}
              >
                {strings.adminReports.resolve}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <section>
        <h2>{strings.adminReports.suspendTitle}</h2>
        <p>{strings.adminReports.suspendHelp}</p>
        <p>
          <label>
            {strings.adminReports.suspendIdLabel}
            <input value={suspendId} onChange={(event) => setSuspendId(event.target.value)} />
          </label>
        </p>
        <p>
          <label>
            {strings.adminReports.suspendReasonLabel}
            <input
              value={suspendReason}
              maxLength={1000}
              onChange={(event) => setSuspendReason(event.target.value)}
            />
          </label>
        </p>
        <p>
          <label>
            {strings.adminReports.suspendEndLabel}
            <input
              value={suspendEnd}
              placeholder="YYYY-MM-DD"
              onChange={(event) => setSuspendEnd(event.target.value)}
            />
          </label>
        </p>
        <button type="button" disabled={busy === "suspend"} onClick={() => void suspend()}>
          {strings.adminReports.suspendSubmit}
        </button>
      </section>

      <p role="status">{message}</p>
    </main>
  );
}
