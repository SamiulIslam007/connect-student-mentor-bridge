"use client";

import { useState, type FormEvent } from "react";

import { strings } from "../../lib/strings";

/**
 * Reset-link request (FR-AUTH-07). Loading, success, invalid-email, and
 * network states are explicit, and the success copy is identical whether or
 * not the address has an account.
 */
export default function ForgotPasswordPage() {
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [invalidEmail, setInvalidEmail] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "");

    setInvalidEmail(false);
    setSent(false);
    setMessage(null);
    setPending(true);

    try {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const body = (await response.json().catch(() => ({}))) as { code?: string };

      if (response.status === 422 && body.code === "VALIDATION_FAILED") {
        setInvalidEmail(true);
        setMessage(strings.forgotPassword.invalid);
      } else if (!response.ok) {
        setMessage(strings.forgotPassword.error);
      } else {
        setSent(true);
        setMessage(strings.forgotPassword.success);
      }
    } catch {
      setMessage(strings.forgotPassword.network);
    } finally {
      setPending(false);
    }
  }

  return (
    <main>
      <h1>{strings.forgotPassword.title}</h1>
      <p>{strings.forgotPassword.intro}</p>
      <form onSubmit={onSubmit} noValidate>
        <p>
          <label htmlFor="email">{strings.forgotPassword.email}</label>
          <br />
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            aria-invalid={invalidEmail}
            aria-describedby={invalidEmail ? "forgot-password-error" : undefined}
          />
        </p>
        <button type="submit" disabled={pending}>
          {pending ? strings.forgotPassword.sending : strings.forgotPassword.submit}
        </button>
      </form>
      <p role="status" id={invalidEmail ? "forgot-password-error" : undefined}>
        {message}
      </p>
      {sent ? null : (
        <p>
          <a href="/sign-in">{strings.forgotPassword.backToSignIn}</a>
        </p>
      )}
    </main>
  );
}
