import { Bricolage_Grotesque, Instrument_Sans, JetBrains_Mono } from "next/font/google";

/*
 * ADR-014 font pairing, self-hosted by next/font (downloaded at build time).
 * Each exposes a source CSS variable that globals.css maps to Tailwind's theme names
 * (--font-display, --font-sans, --font-mono). The names differ on purpose, so the theme
 * mapping never references itself.
 */

/** Display and H1–H2: variable weight, optical size and width. */
export const displayFont = Bricolage_Grotesque({
  subsets: ["latin"],
  axes: ["opsz", "wdth"],
  display: "swap",
  variable: "--font-bricolage",
});

/** Body and UI: variable weight and width. */
export const sansFont = Instrument_Sans({
  subsets: ["latin"],
  axes: ["wdth"],
  display: "swap",
  variable: "--font-instrument-sans",
});

/** Data only (money, counts, IDs, timestamps), always with tabular numerals. */
export const monoFont = JetBrains_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-jetbrains-mono",
});

/** Class names that define the three source variables; put them on <html>. */
export const fontVariables = [displayFont.variable, sansFont.variable, monoFont.variable].join(" ");
