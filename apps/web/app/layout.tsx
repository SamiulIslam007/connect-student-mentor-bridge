import type { Metadata } from "next";
import type { ReactNode } from "react";

import { APP_NAME } from "@connect/config";

import { SessionNav } from "./session-nav";

export const metadata: Metadata = {
  title: APP_NAME,
  description: "Structured mentorship with confirmed outcomes.",
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
