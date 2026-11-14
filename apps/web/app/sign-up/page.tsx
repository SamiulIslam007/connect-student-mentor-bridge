"use client";

import { useState, type FormEvent } from "react";

import { canSubmitSignUp } from "../../lib/consent-document";
import { stateKey } from "../../lib/page-state";
import { NETWORK_ERROR_STATUS, signUpErrorMessage } from "../../lib/sign-up-errors";
import { strings } from "../../lib/strings";
import { csrfFetch } from "../../lib/csrf-client";

/** The success message is the only non-error outcome; everything else is mapped. */
function messageFor(status: number, code: string | undefined): string {
  return status >= 200 && status < 300
    ? strings.signUp.success
    : signUpErrorMessage(status, code);
}

export default function SignUpPage() {
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [success, setSuccess] = useState(false);
  const [consentAccepted, setConsentAccepted] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    // The browser gate only; the API refuses the same request without the flag (D-82).
    if (!canSubmitSignUp(consentAccepted)) {
      setSuccess(false);
      setMessage(strings.signUp.consentRequired);
      return;
    }
    const form = new FormData(event.currentTarget);

    setPending(true);
    let status: number;
    let code: string | undefined;
    try {
      const response = await csrfFetch("/api/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          display_name: form.get("display_name"),
          email: form.get("email"),
          password: form.get("password"),
          date_of_birth: form.get("date_of_birth"),
          consent_accepted: consentAccepted,
        }),
      });
      status = response.status;
      const body = (await response.json().catch(() => ({}))) as { code?: string };
      code = body.code;
    } catch {
      status = NETWORK_ERROR_STATUS;
    } finally {
      setPending(false);
    }

    // The form is uncontrolled, so the non-password values survive a failure.
    const succeeded = status >= 200 && status < 300;
    setSuccess(succeeded);
    setMessage(messageFor(status, code));
  }

  function onGoogleSignIn(): void {
    void (async () => {
      const response = await csrfFetch("/api/auth/sign-in/provider", {
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
      <h1>{strings.signUp.title}</h1>
      <form onSubmit={onSubmit}>
        <p>
          <label htmlFor="display_name">{strings.signUp.displayName}</label>
          <br />
          <input id="display_name" name="display_name" required maxLength={100} autoComplete="name" />
        </p>
        <p>
          <label htmlFor="email">{strings.signUp.email}</label>
          <br />
          <input id="email" name="email" type="email" required autoComplete="email" />
        </p>
        <p>
          <label htmlFor="password">{strings.signUp.password}</label>
          <br />
          <input
            id="password"
            name="password"
            type="password"
            required
            minLength={12}
            autoComplete="new-password"
          />
        </p>
        <p>
          <label htmlFor="date_of_birth">{strings.signUp.dateOfBirth}</label>
          <br />
          <input id="date_of_birth" name="date_of_birth" type="date" required />
        </p>
        <p>{strings.signUp.ageGateNote}</p>
        <p>
          <label>
            <input
              type="checkbox"
              name="consent_accepted"
              required
              checked={consentAccepted}
              onChange={(event) => setConsentAccepted(event.target.checked)}
            />{" "}
            {strings.signUp.consentLabel} <a href="/terms">{strings.signUp.consentTerms}</a>{" "}
            {strings.signUp.consentAnd} <a href="/privacy">{strings.signUp.consentPrivacy}</a>
          </label>
        </p>
        <button type="submit" disabled={pending || !canSubmitSignUp(consentAccepted)}>
          {pending ? stateKey("loading", "signUp") : strings.signUp.submit}
        </button>
      </form>
      <p>
        <button type="button" disabled={pending} onClick={onGoogleSignIn}>
          {strings.signIn.google}
        </button>
      </p>
      {message ? <p role={success ? "status" : "alert"}>{message}</p> : null}
      {success ? (
        <p>
          <a href="/sign-in">{strings.signIn.title}</a>
        </p>
      ) : null}
    </main>
  );
}
