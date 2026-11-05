"use client";

import { useEffect, useState } from "react";

import { isSignedIn, navLinks } from "../lib/navigation";

/**
 * The app header (design D1). One probe of `GET /api/me` per full page load;
 * the app name renders alone until the answer arrives so a visitor is never
 * offered a control that does nothing (design D2).
 */
export function SessionNav() {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;

    fetch("/api/me")
      .then((response) => {
        if (active) {
          setSignedIn(isSignedIn(response.status));
        }
      })
      .catch(() => {
        if (active) {
          // A failed probe is treated as signed out, never as an error page.
          setSignedIn(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  const nav = navLinks(signedIn === true);

  async function signOut(): Promise<void> {
    // The BFF clears the cookie on both success and `401`; either way the
    // visitor ends up on the signed-out home page.
    await fetch("/api/auth/sign-out", { method: "POST" }).catch(() => undefined);
    window.location.assign("/");
  }

  return (
    <header>
      <a href="/">{nav.appName}</a>
      {signedIn === null ? null : (
        <nav aria-label="Main">
          <ul>
            {nav.items.map((item) =>
              item.kind === "link" ? (
                <li key={item.href}>
                  <a href={item.href}>{item.label}</a>
                </li>
              ) : (
                <li key={item.kind}>
                  <button type="button" onClick={() => void signOut()}>
                    {item.label}
                  </button>
                </li>
              ),
            )}
          </ul>
        </nav>
      )}
    </header>
  );
}
