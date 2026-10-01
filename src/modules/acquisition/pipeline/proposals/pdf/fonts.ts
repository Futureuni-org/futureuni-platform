/**
 * Registers the FUTUREUNI brand typefaces (ADR-014) with `@react-pdf/renderer` from bundled OFL
 * TrueType files. Registration is idempotent. On Node, `src` is an absolute file path resolved from
 * this module's URL. Fonts: Bricolage Grotesque (display/headings), Instrument Sans (body/UI),
 * JetBrains Mono (money, counts, IDs — tabular figures).
 */

import { fileURLToPath } from "node:url";

import { Font } from "@react-pdf/renderer";

export const FONT_DISPLAY = "Bricolage Grotesque";
export const FONT_BODY = "Instrument Sans";
export const FONT_MONO = "JetBrains Mono";

function fontPath(file: string): string {
  return fileURLToPath(new URL(`./fonts/${file}`, import.meta.url));
}

let registered = false;

export function registerBrandFonts(): void {
  if (registered) return;
  Font.register({
    family: FONT_DISPLAY,
    fonts: [
      { src: fontPath("BricolageGrotesque.ttf"), fontWeight: 600 },
      { src: fontPath("BricolageGrotesque.ttf"), fontWeight: 700 },
    ],
  });
  Font.register({
    family: FONT_BODY,
    fonts: [
      { src: fontPath("InstrumentSans.ttf"), fontWeight: 400 },
      { src: fontPath("InstrumentSans.ttf"), fontWeight: 600 },
    ],
  });
  Font.register({ family: FONT_MONO, src: fontPath("JetBrainsMono.ttf") });
  // Keep long URLs and words from being hyphenated across lines.
  Font.registerHyphenationCallback((word) => [word]);
  registered = true;
}
