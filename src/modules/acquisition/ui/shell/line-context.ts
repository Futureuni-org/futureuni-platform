import type { ServiceLine } from "@/contracts/common";

/**
 * SEAM-LINE-CONTEXT (provider).
 *
 * The one place that maps a URL slug to a service line, builds hrefs into a line's sections, and
 * owns the slug table. Phases 16, 17 and 18 consume this (via a stand-in until Phase 15 merges);
 * the signatures are fixed in `docs/prompts/wave-4/wave-4-prep-and-merge.md` Part B2:
 *
 *   resolveLine(slug): { line; slug; label; accentToken } | null
 *   lineHref(line, section?, query?): string
 *   LINE_SLUGS: Record<ServiceLine, string>
 *
 * Pure data only — safe to import from both server and client components.
 */

/**
 * Window event that asks the section-nav badges to refetch (dispatched after a mutation that
 * changes a count). Defined here, in a server-import-free module, so client components can use it
 * without pulling the `"use server"` badge action.
 */
export const REFRESH_BADGES_EVENT = "acq:refresh-badges";

/** Canonical slug for each service line (route map B1). */
export const LINE_SLUGS: Record<ServiceLine, string> = {
  WEB_DEVELOPMENT: "web-development",
  UI_UX_DESIGN: "ui-ux-design",
  GRAPHIC_DESIGN: "graphic-design",
  VIDEO_EDITING: "video-editing",
};

const LINE_LABELS: Record<ServiceLine, string> = {
  WEB_DEVELOPMENT: "Web Development",
  UI_UX_DESIGN: "UI/UX Design",
  GRAPHIC_DESIGN: "Graphic Design",
  VIDEO_EDITING: "Video Editing",
};

/**
 * Accent token per line. These values are identical to the design tokens
 * `--accent-{web,uiux,graphic,video}` in `src/styles/tokens.css` and mirror `serviceLineAccent`
 * in `@/lib/chart-theme`, so a line's accent is one colour everywhere (tabs, charts, markers).
 */
const LINE_ACCENT_TOKEN: Record<ServiceLine, string> = {
  WEB_DEVELOPMENT: "chart-1",
  UI_UX_DESIGN: "chart-6",
  GRAPHIC_DESIGN: "chart-3",
  VIDEO_EDITING: "chart-5",
};

const SLUG_TO_LINE: Record<string, ServiceLine> = Object.fromEntries(
  Object.entries(LINE_SLUGS).map(([line, slug]) => [slug, line as ServiceLine]),
);

export interface LineContext {
  line: ServiceLine;
  slug: string;
  label: string;
  accentToken: string;
}

/** Resolve a URL slug to its line context, or `null` for an unknown slug (caller `notFound()`s). */
export function resolveLine(slug: string): LineContext | null {
  // `Object.hasOwn` guards against inherited keys: a slug like "constructor" or "toString" would
  // otherwise read a function off `Object.prototype` and resolve to a bogus line (a 500 downstream).
  if (!Object.hasOwn(SLUG_TO_LINE, slug)) return null;
  const line = SLUG_TO_LINE[slug];
  if (line === undefined) return null;
  return { line, slug, label: LINE_LABELS[line], accentToken: LINE_ACCENT_TOKEN[line] };
}

/**
 * Build a link into a line's section, with optional query parameters.
 *
 *   lineHref("WEB_DEVELOPMENT")                               -> /acquisition/web-development
 *   lineHref("WEB_DEVELOPMENT", "review")                     -> /acquisition/web-development/review
 *   lineHref("WEB_DEVELOPMENT", "search", { run: "abc" })     -> /acquisition/web-development/search?run=abc
 */
export function lineHref(
  line: ServiceLine,
  section?: string,
  query?: Record<string, string>,
): string {
  const base = `/acquisition/${LINE_SLUGS[line]}`;
  const path = section !== undefined && section.length > 0 ? `${base}/${section}` : base;
  const qs = new URLSearchParams(query).toString();
  return qs.length > 0 ? `${path}?${qs}` : path;
}

/** The label for a resolved line (used where only the enum is in hand). */
export function lineLabel(line: ServiceLine): string {
  return LINE_LABELS[line];
}

/** The accent token for a line (used where only the enum is in hand). */
export function lineAccentToken(line: ServiceLine): string {
  return LINE_ACCENT_TOKEN[line];
}
