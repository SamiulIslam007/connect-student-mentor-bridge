"use client";

import { useState, type FormEvent } from "react";

import { stateKey } from "../../lib/page-state";
import { strings } from "../../lib/strings";

const FORM_ID = "sign-in-form";

export default function SignInPage() {
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [emailNotVerified, setEmailNotVerified] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setPending(true);
    setMessage(null);
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/auth/sign-in", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: form.get("email"), password: form.get("password") }),
      });
      const body = (await response.json().catch(() => ({}))) as { code?: string; status?: string };

      // A withheld session: the second step happens on its own page.
      if (response.ok && body.status === "mfa_required") {
        window.location.assign("/sign-in/mfa");
        return;
      }

      // Same destination as the provider callback (spec: sign-in lands on the account).
      if (response.ok) {
        window.location.assign("/account");
        return;
      }

      setEmailNotVerified(response.status === 403 && body.code === "EMAIL_NOT_VERIFIED");

      if (response.status === 403 && body.code === "EMAIL_NOT_VERIFIED") {
        setMessage(strings.signIn.emailNotVerified);
      } else if (response.status === 403 && body.code === "ACCOUNT_SUSPENDED") {
        setMessage(strings.signIn.suspended);
      } else if (response.status === 403) {
        setMessage(strings.signIn.forbidden);
      } else {
        setMessage(strings.signIn.error);
      }
    } catch {
      setMessage(strings.signIn.error);
    } finally {
      setPending(false);
    }
  }

  function onGoogleSignIn(): void {
    void (async () => {
      const response = await fetch("/api/auth/sign-in/provider", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider: "google" }),
      });
      const body = (await response.json().catch(() => ({}))) as { authorization_url?: string };
      if (response.ok && body.authorization_url) {
        window.location.assign(body.authorization_url);
        return;
      }
      setMessage(strings.signIn.googleError);
    })();
  }

  return (
    <main>
      <h1>{strings.signIn.title}</h1>
      <form id={FORM_ID} onSubmit={onSubmit}>
        <p>
          <label htmlFor="email">{strings.signIn.email}</label>
          <br />
          <input id="email" name="email" type="email" required autoComplete="email" />
        </p>
        <p>
          <label htmlFor="password">{strings.signIn.password}</label>
          <br />
          <input id="password" name="password" type="password" required autoComplete="current-password" />
        </p>
        <button type="submit" disabled={pending}>
          {pending ? stateKey("loading", "signIn") : strings.signIn.submit}
        </button>
      </form>
      <p>
        <a href="/forgot-password">{strings.forgotPassword.title}</a>
      </p>
      <p>
        <button type="button" disabled={pending} onClick={onGoogleSignIn}>
          {strings.signIn.google}
        </button>
      </p>
      {message ? <p role="alert">{message}</p> : null}
      {emailNotVerified ? (
        <p>
          {/* The API re-sends the verification link on every refused sign-in. */}
          <button type="submit" form={FORM_ID}>
            {strings.signIn.resendVerification}
          </button>
        </p>
      ) : null}
    </main>
  );
}
