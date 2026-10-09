import type { MetadataRoute } from "next";

import { PWA_BACKGROUND_COLOR, PWA_THEME_COLOR } from "@/styles/pwa-theme";

/**
 * Web app manifest (Next 16 metadata route, served at `/manifest.webmanifest`). Makes the
 * internal platform installable as a PWA. `src/proxy.ts` allowlists this path so the browser
 * can fetch it without a session cookie — otherwise it would be redirected to `/login` and the
 * app would silently fail the installability check.
 *
 * Colours come from the brand tokens in `src/styles/tokens.css` (navy `--sidebar` / `--primary`).
 * The icon set is generated from `public/brand/futureuni-mark.png` by
 * `scripts/pwa/generate-icons.mjs`.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "FUTUREUNI",
    short_name: "FUTUREUNI",
    description: "FUTUREUNI's internal platform.",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: PWA_BACKGROUND_COLOR,
    theme_color: PWA_THEME_COLOR,
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
