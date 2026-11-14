"use client";

import { useState, type FormEvent } from "react";

import { stateKey } from "../../lib/page-state";
import { strings } from "../../lib/strings";
import { csrfFetch } from "../../lib/csrf-client";

export function ResetForm({ token }: { token: string }) {
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [success, setSuccess] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setMessage(null);
    try {
      const response = await csrfFetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, new_password: form.get("new_password") }),
      });

      setSuccess(response.ok);
      setMessage(response.ok ? strings.reset.success : strings.reset.error);
    } catch {
      setSuccess(false);
      setMessage(strings.reset.error);
    } finally {
      setPending(false);
    }
  }

  return (
    <main>
      <h1>{strings.reset.title}</h1>
      <form onSubmit={onSubmit}>
        <p>
          <label htmlFor="new_password">{strings.reset.password}</label>
          <br />
          <input
            id="new_password"
            name="new_password"
            type="password"
            required
            minLength={12}
            autoComplete="new-password"
          />
        </p>
        <button type="submit" disabled={pending}>
          {pending ? stateKey("loading", "reset") : strings.reset.submit}
        </button>
      </form>
      {message ? <p role={success ? "status" : "alert"}>{message}</p> : null}
      {success ? (
        <p>
          <a href="/sign-in">{strings.signIn.title}</a>
        </p>
      ) : null}
    </main>
  );
}
