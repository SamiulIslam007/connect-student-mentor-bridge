import { strings } from "./strings";

/**
 * The header's link set, derived without React so it can be tested directly
 * (design D1). Signed out is the safe default while the session probe is in
 * flight or has failed (design D2).
 */
export type NavItem =
  | { kind: "link"; href: string; label: string }
  | { kind: "sign-out"; label: string };

export interface NavModel {
  appName: string;
  items: NavItem[];
}

/** Only a `200` answer from `GET /api/me` means signed in. */
export function isSignedIn(status: number): boolean {
  return status === 200;
}

export function navLinks(signedIn: boolean, roles: readonly string[] = []): NavModel {
  return {
    appName: strings.appName,
    items: signedIn
      ? [
          { kind: "link", href: "/account", label: strings.nav.account },
          { kind: "link", href: "/profile", label: strings.nav.profile },
          { kind: "link", href: "/mentors", label: strings.nav.mentors },
          { kind: "link", href: "/requests", label: strings.nav.requests },
          { kind: "link", href: "/account/sessions", label: strings.nav.sessions },
          ...(roles.includes("PLATFORM_ADMIN")
            ? [{ kind: "link" as const, href: "/admin/reviews", label: strings.nav.admin }]
            : []),
          { kind: "sign-out", label: strings.nav.signOut },
        ]
      : [
          { kind: "link", href: "/sign-in", label: strings.nav.signIn },
          { kind: "link", href: "/sign-up", label: strings.nav.createAccount },
        ],
  };
}
