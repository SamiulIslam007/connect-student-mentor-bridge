import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import { APP_NAME } from "@connect/config";

import { manifestColors } from "./manifest";
import { SessionNav } from "./session-nav";
import "./globals.css";

export const metadata: Metadata = {
  title: APP_NAME,
  description: "Structured mentorship with confirmed outcomes.",
  manifest: "/manifest.webmanifest",
  icons: { apple: "/icon-192.png" },
};

export const viewport: Viewport = {
  themeColor: manifestColors.theme,
};

/**
 * Every page must carry the per-request CSP nonce on its inline bootstrap
 * scripts, and Next only stamps a nonce on a dynamically rendered page
 * (SEC-AUDIT-017, D-261). The app is small and session-dependent, so rendering
 * per request is the cheaper price than leaving `script-src 'unsafe-inline'`.
 */
export const dynamic = "force-dynamic";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <SessionNav />
        {children}
      </body>
    </html>
  );
}
