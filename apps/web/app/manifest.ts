import type { MetadataRoute } from "next";

import { strings } from "../lib/strings";

/** One source for the install colours: the manifest and the layout's themeColor both read it (D-107). */
export const manifestColors = {
  background: "#ffffff",
  theme: "#0f172a",
} as const;

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: strings.appName,
    short_name: strings.appName,
    description: "Structured mentorship with confirmed outcomes.",
    start_url: "/",
    display: "standalone",
    background_color: manifestColors.background,
    theme_color: manifestColors.theme,
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
