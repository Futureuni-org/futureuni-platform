/*
 * Literal brand colours for PWA surfaces that cannot use CSS variables: the web app manifest
 * (src/app/manifest.ts) and the document `themeColor` (src/app/layout.tsx). The browser and OS
 * read these before any stylesheet loads, so they must be concrete values, not `var(--token)`.
 *
 * This file lives under src/styles/** — the one place raw colours are allowed (eslint colour ban).
 * Keep the values in step with src/styles/tokens.css: `--sidebar` navy and the dark `--background`.
 */

/** Browser/title-bar + manifest `theme_color`. Mirrors tokens.css `--sidebar` (#0c1148). */
export const PWA_THEME_COLOR = "#0c1148";

/** Manifest `background_color` (splash background). Mirrors dark `--background` (#060925). */
export const PWA_BACKGROUND_COLOR = "#060925";
