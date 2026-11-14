"use client";

import { useEffect, useReducer, useState, type FormEvent } from "react";

import { enrollReducer, initialEnrollmentState } from "../../../lib/enrollment-state";
import { stateKey } from "../../../lib/page-state";
import { strings } from "../../../lib/strings";
import { csrfFetch } from "../../../lib/csrf-client";

export default function SecurityPage() {
  const [state, dispatch] = useReducer(enrollReducer, initialEnrollmentState);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  const [signedOut, setSignedOut] = useState(false);
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let active = true;

    async function load(): Promise<void> {
      setLoading(true);
      try {
        const response = await fetch("/api/me");
        if (!active) {
          return;
        }
        if (response.status === 401) {
          setSignedOut(true);
          return;
        }
        if (!response.ok) {
          dispatch({ type: "failed", message: strings.security.error });
          return;
        }
        const body = (await response.json()) as { mfa_enabled?: boolean };
        dispatch({ type: "loaded", mfaEnabled: body.mfa_enabled === true });
      } catch {
        if (active) {
          dispatch({ type: "failed", message: strings.security.error });
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, [reloadKey]);

  async function post(path: string, body: unknown): Promise<Response> {
    return csrfFetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  async function enroll(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setBusy(true);
    dispatch({ type: "dismissed" });
    try {
      const response = await post("/api/auth/mfa/enroll", { password });
      const body = (await response.json().catch(() => ({}))) as {
        totp_uri?: string;
        backup_codes?: string[];
      };
      if (response.ok && body.totp_uri) {
        const uri = body.totp_uri;
        const secret = new URL(uri).searchParams.get("secret") ?? "";
        setPassword("");
        dispatch({ type: "enrolled", secret, uri, backupCodes: body.backup_codes ?? [] });
        return;
      }
      const refused = response.status === 400 || response.status === 401 || response.status === 422;
      dispatch({
        type: "failed",
        message: refused ? strings.security.wrongPassword : strings.security.error,
      });
    } catch {
      dispatch({ type: "failed", message: strings.security.error });
    } finally {
      setBusy(false);
    }
  }

  async function verify(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setBusy(true);
    dispatch({ type: "dismissed" });
    try {
      const response = await post("/api/auth/mfa/verify", { code });
      if (response.ok) {
        setCode("");
        dispatch({ type: "verified" });
        return;
      }
      const refused = response.status === 400 || response.status === 422;
      dispatch({
        type: "failed",
        message: refused ? strings.security.wrongCode : strings.security.error,
      });
    } catch {
      dispatch({ type: "failed", message: strings.security.error });
    } finally {
      setBusy(false);
    }
  }

  async function disable(): Promise<void> {
    setBusy(true);
    dispatch({ type: "dismissed" });
    try {
      const response = await post("/api/auth/mfa/disable", { password });
      setPassword("");
      if (response.ok) {
        dispatch({ type: "disabled" });
        return;
      }
      const refused = response.status === 400 || response.status === 401 || response.status === 422;
      dispatch({
        type: "failed",
        message: refused ? strings.security.wrongPassword : strings.security.error,
      });
    } catch {
      dispatch({ type: "failed", message: strings.security.error });
    } finally {
      setBusy(false);
    }
  }

  async function copySecret(secret: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(secret);
      setCopied(true);
    } catch {
      // A plain-http page has no clipboard API: select the text so it can be copied by hand.
      const element = document.getElementById("totp-secret");
      if (!element) {
        return;
      }
      const range = document.createRange();
      range.selectNodeContents(element);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    }
  }

  if (signedOut) {
    return (
      <main>
        <h1>{strings.security.title}</h1>
        <p>{strings.security.signedOut}</p>
        <p>
          <a href="/sign-in">{strings.security.backToSignIn}</a>
        </p>
      </main>
    );
  }

  return (
    <main>
      <h1>{strings.security.title}</h1>
      {loading ? <p role="status">{stateKey("loading", "security")}</p> : null}
      {state.error ? <p role="alert">{state.error}</p> : null}
      {busy ? <p role="status">{strings.security.working}</p> : null}
      {!loading && state.error ? (
        <button type="button" onClick={() => setReloadKey((value) => value + 1)}>
          {strings.security.retry}
        </button>
      ) : null}

      {state.phase === "idle" && !loading ? (
        <>
          <p>{strings.security.statusOff}</p>
          <p>{strings.security.enrollIntro}</p>
          <form onSubmit={enroll}>
            <p>
              <label htmlFor="enroll-password">{strings.signIn.password}</label>
              <br />
              <input
                id="enroll-password"
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </p>
            <button type="submit" disabled={busy}>
              {strings.security.enroll}
            </button>
          </form>
        </>
      ) : null}

      {state.phase === "pending" ? (
        <>
          <h2>{strings.security.pendingTitle}</h2>
          <p>{strings.security.pendingIntro}</p>
          <p>
            <span>{strings.security.secretLabel}: </span>
            <code id="totp-secret">{state.secret}</code>
          </p>
          <p>
            <button type="button" onClick={() => void copySecret(state.secret)}>
              {strings.security.copy}
            </button>
            {copied ? <span role="status"> {strings.security.copied}</span> : null}
          </p>
          <p>
            <a href={state.uri}>{strings.security.uriLink}</a>
          </p>
          <p>
            <strong>{strings.security.codesWarning}</strong>
          </p>
          <ol aria-label={strings.security.codesLabel}>
            {state.backupCodes.map((backupCode) => (
              <li key={backupCode}>
                <code>{backupCode}</code>
              </li>
            ))}
          </ol>
          <form onSubmit={verify}>
            <p>
              <label htmlFor="verify-code">{strings.security.codeLabel}</label>
              <br />
              <input
                id="verify-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                value={code}
                onChange={(event) => setCode(event.target.value)}
              />
            </p>
            <button type="submit" disabled={busy}>
              {strings.security.verify}
            </button>
          </form>
          <p>{strings.security.verifyNote}</p>
          <p>{strings.security.restartWarning}</p>
        </>
      ) : null}

      {state.phase === "enrolled" || state.phase === "disabling" ? (
        <>
          <p>{strings.security.statusOn}</p>
          <p>{strings.security.disableIntro}</p>
          <p>
            <label htmlFor="disable-password">{strings.signIn.password}</label>
            <br />
            <input
              id="disable-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </p>
          {state.phase === "disabling" ? (
            <p>
              <button type="button" disabled={busy} onClick={() => void disable()}>
                {strings.security.disableConfirm}
              </button>
              <button type="button" onClick={() => dispatch({ type: "dismissed" })}>
                {strings.security.cancel}
              </button>
            </p>
          ) : (
            <button
              type="button"
              disabled={busy || password.length === 0}
              onClick={() => dispatch({ type: "disableRequested" })}
            >
              {strings.security.disable}
            </button>
          )}
        </>
      ) : null}

      <p>
        <a href="/account">{strings.account.backToAccount}</a>
      </p>
    </main>
  );
}
