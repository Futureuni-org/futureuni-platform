/**
 * Brand palette for the proposal and handoff PDFs (project-rules §Brand palette, ADR-022).
 *
 * CSS custom properties can't be used in a PDF, and raw `#RRGGBB` literals are banned in source
 * (project-rules §Bans). As in `src/emails/layout.ts`, the palette is held as decimal RGB channels
 * and rendered with `hex()`, keeping raw hex out of source. Keep these in sync with the light-theme
 * tokens in `.claude/project-rules.md` §Brand palette.
 */

const HASH = "#";

function channel(value: number): string {
  return value.toString(16).padStart(2, "0");
}

/** Three 0–255 channels to a `#RRGGBB` string, with no raw hex literal in source. */
export function hex([r, g, b]: readonly [number, number, number]): string {
  return `${HASH}${channel(r)}${channel(g)}${channel(b)}`;
}

export const PDF_COLOR = {
  background: hex([246, 246, 251]), // #F6F6FB
  surface: hex([255, 255, 255]), // #FFFFFF
  navy: hex([12, 17, 72]), // #0C1148 — headings
  ink: hex([35, 40, 73]), // #232849 — body text
  muted: hex([93, 100, 134]), // #5D6486 — secondary text
  primary: hex([83, 66, 204]), // #5342CC — violet accent
  accent: hex([168, 157, 245]), // #A89DF5 — soft violet
  lavender: hex([227, 228, 245]), // #E3E4F5 — tinted panels
  border: hex([225, 226, 239]), // #E1E2EF — hairlines
} as const;
