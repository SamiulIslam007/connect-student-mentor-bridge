import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import { APP_NAME } from "@connect/config";

import { manifestColors } from "./manifest";
import { SessionNav } from "./session-nav";

export const metadata: Metadata = {
  title: APP_NAME,
  description: "Structured mentorship with confirmed outcomes.",
  manifest: "/manifest.webmanifest",
  icons: { apple: "/icon-192.png" },
};

export const viewport: Viewport = {
  themeColor: manifestColors.theme,
};

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
