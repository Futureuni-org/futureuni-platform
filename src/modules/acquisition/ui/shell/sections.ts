import type { PermissionAction } from "@/contracts/permissions";

/**
 * The seven sections every service-line tab shows, in navigation order (module spec §3.1).
 * Each carries the permission that reveals it and, for the three busy sections, the kind of live
 * count badge it shows.
 */

export type SectionBadgeKind = "review" | "inbox" | "pipeline";

export interface SectionDef {
  /** URL segment under `/acquisition/[line]/`. */
  segment: string;
  label: string;
  /** Shown only when the viewer may take this action on the line. */
  action: PermissionAction;
  /** Which live count (if any) this section shows. */
  badge?: SectionBadgeKind;
}

export const SECTIONS: readonly SectionDef[] = [
  { segment: "search", label: "Search", action: "acquisition.search.read" },
  { segment: "review", label: "Review", action: "acquisition.review.read", badge: "review" },
  { segment: "leads", label: "Leads", action: "acquisition.lead.read" },
  { segment: "pipeline", label: "Pipeline", action: "acquisition.pipeline.read", badge: "pipeline" },
  { segment: "inbox", label: "Inbox", action: "acquisition.inbox.read", badge: "inbox" },
  { segment: "analytics", label: "Analytics", action: "acquisition.analytics.read" },
  { segment: "settings", label: "Settings", action: "acquisition.profile.read" },
];

export interface SectionBadgeCounts {
  review: number;
  reviewMore: boolean;
  inbox: number;
  pipeline: number;
}
