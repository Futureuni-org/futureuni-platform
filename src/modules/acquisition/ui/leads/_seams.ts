import type { ServiceLine } from "@/contracts/common";

/**
 * SEAM:SEAM-LINE-CONTEXT
 *
 * Phase 15 owns the real service-line context (`@/modules/acquisition/ui/shell`): it resolves a
 * URL slug to a service line, builds hrefs into a line's sections, and owns the slug table. Phase
 * 15 is not merged yet, so this stand-in implements the Wave 4 B1 slug table exactly. At Wave 4
 * integration (B6) every import of this module is repointed at `@/modules/acquisition/ui/shell`
 * and this file is deleted (`grep -r "SEAM:" src` must then be empty). See CR-16-SEAM-1.
 *
 * This file is the shared context for Phase 16's three areas (leads, pipeline, inbox); the pipeline
 * and inbox folders import `resolveLine` / `lineHref` / `LINE_SLUGS` from here.
 *
 * Signature (fixed in wave-4-prep-and-merge.md Part B):
 *   resolveLine(slug): { line; slug; label; accentToken } | null
 *   lineHref(line, section?, query?): string
 *   LINE_SLUGS: Record<ServiceLine, string>
 */

/** Canonical slug for each service line (B1 route map). */
// SEAM:SEAM-LINE-CONTEXT
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

/** Chart accent token per line (mirrors `serviceLineAccent` in `@/lib/chart-theme`). */
const LINE_ACCENT_TOKEN: Record<ServiceLine, string> = {
  WEB_DEVELOPMENT: "chart-1",
  UI_UX_DESIGN: "chart-6",
  GRAPHIC_DESIGN: "chart-3",
  VIDEO_EDITING: "chart-5",
};

// A Map, not a plain object: a slug such as "constructor" or "__proto__" would otherwise resolve to
// an inherited property and reach the database as a service line (a 500 rather than a 404). The
// Phase 15 shell has the same lookup; see CR-16-SEAM-1.
const SLUG_TO_LINE = new Map<string, ServiceLine>(
  Object.entries(LINE_SLUGS).map(([line, slug]) => [slug, line as ServiceLine]),
);

export interface LineContext {
  line: ServiceLine;
  slug: string;
  label: string;
  accentToken: string;
}

// SEAM:SEAM-LINE-CONTEXT
export function resolveLine(slug: string): LineContext | null {
  const line = SLUG_TO_LINE.get(slug);
  if (line === undefined) return null;
  return { line, slug, label: LINE_LABELS[line], accentToken: LINE_ACCENT_TOKEN[line] };
}

/**
 * A link into a service line's section. `section` is a sub-route from the B1 route map
 * (`leads`, `pipeline`, `inbox`, `review`, `search`, `analytics`, `settings`); omitting it links to
 * the line root. `query` becomes the query string.
 */
// SEAM:SEAM-LINE-CONTEXT
export function lineHref(
  line: ServiceLine,
  section?: string,
  query?: Record<string, string>,
): string {
  const base = `/acquisition/${LINE_SLUGS[line]}`;
  const path = section !== undefined && section !== "" ? `${base}/${section}` : base;
  const qs = new URLSearchParams(query).toString();
  return qs.length > 0 ? `${path}?${qs}` : path;
}
