/**
 * Chart theme (project-rules §Brand and UI, `saas-ui/patterns.md §Charts`).
 *
 * The eight categorical series and the sequential + diverging scales are derived from the
 * FUTUREUNI palette in `src/styles/tokens.css`. Every ratio was contrast-checked in Phase 0's
 * project-rules table (chart-3 and chart-8 are at the 3:1 floor in light mode — never used for
 * text; the summary `<details>` fallback carries the actual values).
 *
 * The values are duplicated here (not read from CSS) so the SSR pass renders identical to
 * post-hydration and the chart library gets synchronous strings.
 */

export type ChartTheme = "light" | "dark";

interface Palette {
  series: readonly string[];
  /** 5-stop sequential (violet). */
  sequentialPrimary: readonly [string, string, string, string, string];
  /** 5-stop sequential (accent). */
  sequentialAccent: readonly [string, string, string, string, string];
  /** 5-stop diverging: negative → neutral → positive. */
  diverging: readonly [string, string, string, string, string];
  /** Neutral grid / axis colour (matches `--border` in the tokens). */
  grid: string;
  /** Axis label / tick text. */
  axis: string;
  /** Tooltip surface. */
  tooltipBg: string;
  tooltipFg: string;
}

const LIGHT: Palette = {
  series: [
    "#5342CC", // chart-1 primary
    "#12877A", // chart-2 teal
    "#C27A0E", // chart-3 amber — 3:1 in light; never text
    "#CF4F63", // chart-4 crimson
    "#2F7FD0", // chart-5 blue
    "#8A5CC9", // chart-6 lilac
    "#3A4170", // chart-7 slate
    "#5E9A2F", // chart-8 green — 3:1 in light; never text
  ],
  sequentialPrimary: ["#E3E4F5", "#B4AAF0", "#8677E1", "#6653D6", "#5342CC"],
  sequentialAccent: ["#A89DF5", "#8878EA", "#6653D6", "#3F2FA6", "#0C1148"],
  diverging: ["#BF2B40", "#F0B34A", "#F4EFDE", "#4FD19F", "#137A52"],
  grid: "#E1E2EF",
  axis: "#5D6486",
  tooltipBg: "#FFFFFF",
  tooltipFg: "#232849",
};

const DARK: Palette = {
  series: [
    "#A89DF5", // chart-1
    "#3FC2B1", // chart-2
    "#F0B34A", // chart-3
    "#F07C8C", // chart-4
    "#6FAEF2", // chart-5
    "#D59CF0", // chart-6
    "#C6C9E6", // chart-7
    "#8FCB5B", // chart-8
  ],
  sequentialPrimary: ["#22286B", "#3F2FA6", "#6653D6", "#8878EA", "#A89DF5"],
  sequentialAccent: ["#22286B", "#3F2FA6", "#6B5CE0", "#A89DF5", "#ECEDF8"],
  diverging: ["#FF8A99", "#F2B955", "#20266A", "#4FD19F", "#3FC2B1"],
  grid: "#20266A",
  axis: "#A9ADCC",
  tooltipBg: "#161C5C",
  tooltipFg: "#ECEDF8",
};

const PALETTES: Record<ChartTheme, Palette> = { light: LIGHT, dark: DARK };

/** Palette for the given theme. */
export function chartPalette(theme: ChartTheme): Palette {
  return PALETTES[theme];
}

/** The N-th categorical series colour (wraps around 8). */
export function chartSeries(theme: ChartTheme, index: number): string {
  const series = PALETTES[theme].series;
  const value = series[index % series.length];
  return value ?? series[0] ?? "#5342CC";
}

/** 5-stop sequential scale. */
export function chartSequential(
  theme: ChartTheme,
  variant: "primary" | "accent" = "primary",
): readonly string[] {
  return variant === "primary"
    ? PALETTES[theme].sequentialPrimary
    : PALETTES[theme].sequentialAccent;
}

/** 5-stop diverging scale (negative → neutral → positive). */
export function chartDiverging(theme: ChartTheme): readonly string[] {
  return PALETTES[theme].diverging;
}

/** Grid and axis colours, matching the token equivalents. */
export function chartAxes(theme: ChartTheme): { grid: string; axis: string } {
  const palette = PALETTES[theme];
  return { grid: palette.grid, axis: palette.axis };
}

/** Tooltip surface + text; components render their own container with these values. */
export function chartTooltip(theme: ChartTheme): { bg: string; fg: string } {
  const palette = PALETTES[theme];
  return { bg: palette.tooltipBg, fg: palette.tooltipFg };
}

/**
 * Service-line accent colours. Derived from the categorical palette so charts and tabs use the
 * same source of truth. `WEB_DEVELOPMENT → chart-1 (violet)`, `UI_UX_DESIGN → chart-6 (lilac)`,
 * `GRAPHIC_DESIGN → chart-3 (amber)`, `VIDEO_EDITING → chart-5 (blue)`.
 */
export const SERVICE_LINE_ACCENT_INDEX: Record<
  "WEB_DEVELOPMENT" | "UI_UX_DESIGN" | "GRAPHIC_DESIGN" | "VIDEO_EDITING",
  number
> = {
  WEB_DEVELOPMENT: 0,
  UI_UX_DESIGN: 5,
  GRAPHIC_DESIGN: 2,
  VIDEO_EDITING: 4,
};

export function serviceLineAccent(
  theme: ChartTheme,
  line: keyof typeof SERVICE_LINE_ACCENT_INDEX,
): string {
  return chartSeries(theme, SERVICE_LINE_ACCENT_INDEX[line]);
}
