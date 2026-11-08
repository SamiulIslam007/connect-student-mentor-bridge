"use client";

import { useEffect, useState } from "react";

import { strings } from "../../lib/strings";

interface RequestRecord {
  id: string;
  status: string;
  question: string;
  student_name: string;
  mentor_name: string;
  created_at: string;
  expires_at: string;
  decision_note: string | null;
}

type Role = "sent" | "received";

function statusLabel(status: string): string {
  switch (status) {
    case "pending":
      return strings.requests.statusPending;
    case "accepted":
      return strings.requests.statusAccepted;
    case "declined":
      return strings.requests.statusDeclined;
    case "expired":
      return strings.requests.statusExpired;
    case "withdrawn":
      return strings.requests.statusWithdrawn;
    case "redirected":
      return strings.requests.statusRedirected;
    default:
      return status;
  }
}

function dateLabel(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString().slice(0, 16).replace("T", " ");
}

export default function RequestsPage() {
  const [role, setRole] = useState<Role>("received");
  const [requests, setRequests] = useState<RequestRecord[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [signedOut, setSignedOut] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function load(): Promise<void> {
      setMessage(null);
      try {
        const response = await fetch(`/api/requests?role=${role}`);
        if (!active) {
          return;
        }
        if (response.status === 401) {
          setSignedOut(true);
          setMessage(strings.requests.signedOut);
          return;
        }
        if (!response.ok) {
          setMessage(strings.requests.loadError);
          return;
        }
        const payload = (await response.json()) as { data?: RequestRecord[] };
        setRequests(payload.data ?? []);
      } catch (error) {
        console.error(
          JSON.stringify({
            event: "web.requests_load_failed",
            message: error instanceof Error ? error.message : "unknown error",
          }),
        );
        if (active) {
          setMessage(strings.requests.loadError);
        }
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, [role]);

  async function act(id: string, action: "accept" | "decline" | "withdraw"): Promise<void> {
    setBusy(id);
    setMessage(null);
    try {
      const body =
        action === "decline"
          ? JSON.stringify({ reason: window.prompt(strings.requests.declineReason) ?? "" })
          : undefined;
      const response = await fetch(`/api/requests/${id}/${action}`, {
        method: "POST",
        headers: body ? { "content-type": "application/json" } : undefined,
        body,
      });
      if (!response.ok) {
        setMessage(strings.requests.actionError);
        return;
      }
      const payload = (await response.json()) as { status?: string };
      setRequests((rows) =>
        rows.map((row) => (row.id === id ? { ...row, status: payload.status ?? row.status } : row)),
      );
      setMessage(
        action === "accept"
          ? strings.requests.accepted
          : action === "decline"
            ? strings.requests.declined
            : strings.requests.withdrawn,
      );
    } catch (error) {
      console.error(
        JSON.stringify({
          event: "web.request_action_failed",
          message: error instanceof Error ? error.message : "unknown error",
        }),
      );
      setMessage(strings.requests.actionError);
    } finally {
      setBusy(null);
    }
  }

  return (
    <main>
      <h1>{strings.requests.title}</h1>
      <p>{strings.requests.intro}</p>

      <p>
        <button type="button" disabled={role === "sent"} onClick={() => setRole("sent")}>
          {strings.requests.sent}
        </button>{" "}
        <button type="button" disabled={role === "received"} onClick={() => setRole("received")}>
          {strings.requests.received}
        </button>
      </p>

      <p role="status">{message}</p>

      {signedOut ? null : requests.length === 0 ? (
        <p>{strings.requests.empty}</p>
      ) : (
        <ul>
          {requests.map((request) => (
            <li key={request.id}>
              <p>
                <strong>{request.question}</strong>
              </p>
              <p>
                {role === "received" ? strings.requests.from : strings.requests.to}:{" "}
                {role === "received" ? request.student_name : request.mentor_name} ·{" "}
                {statusLabel(request.status)} · {strings.requests.expires}:{" "}
                {dateLabel(request.expires_at)}
              </p>
              {request.decision_note ? <p>{request.decision_note}</p> : null}
              {request.status === "pending" && role === "received" ? (
                <p>
                  <button type="button" disabled={busy === request.id} onClick={() => void act(request.id, "accept")}>
                    {strings.requests.accept}
                  </button>{" "}
                  <button type="button" disabled={busy === request.id} onClick={() => void act(request.id, "decline")}>
                    {strings.requests.decline}
                  </button>
                </p>
              ) : null}
              {request.status === "pending" && role === "sent" ? (
                <p>
                  <button type="button" disabled={busy === request.id} onClick={() => void act(request.id, "withdraw")}>
                    {strings.requests.withdraw}
                  </button>
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <p>
        <a href="/profile">{strings.requests.backToProfile}</a>
      </p>
    </main>
  );
}
