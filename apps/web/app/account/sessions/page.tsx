"use client";

import { useEffect, useState } from "react";

import { strings } from "../../../lib/strings";

interface Session {
  id: string;
  created_at: string;
  expires_at: string;
  current: boolean;
}

export default function SessionsPage() {
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function load(): Promise<void> {
    const response = await fetch("/api/me/sessions");
    if (response.ok) {
      const body = (await response.json()) as { data: Session[] };
      setSessions(body.data);
      return;
    }
    setMessage(response.status === 401 ? strings.sessions.signedOut : strings.sessions.loadError);
  }

  useEffect(() => {
    void load();
  }, []);

  async function revoke(id: string): Promise<void> {
    const response = await fetch(`/api/me/sessions/${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!response.ok) {
      setMessage(strings.sessions.loadError);
      return;
    }
    setMessage(strings.sessions.revoked);
    await load();
  }

  return (
    <main>
      <h1>{strings.sessions.title}</h1>
      <p>{strings.sessions.intro}</p>
      {sessions === null ? null : (
        <ul>
          {sessions.map((session) => (
            <li key={session.id}>
              <span>{new Date(session.created_at).toISOString()}</span>
              {session.current ? <strong>{strings.sessions.current}</strong> : null}
              <button type="button" onClick={() => void revoke(session.id)}>
                {strings.sessions.revoke}
              </button>
            </li>
          ))}
        </ul>
      )}
      {message ? <p role="status">{message}</p> : null}
    </main>
  );
}
