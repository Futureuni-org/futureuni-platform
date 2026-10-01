import "server-only";

/**
 * Seam adapters (wired at the Wave 3 / batch B4 integration). Phase 12 originally stubbed these while
 * Phases 11 and 14 ran in parallel; now they delegate to the real providers. The calls are lazy
 * (dynamic `import`) so the outreach ↔ pipeline edge (getBookingLink) never forms a load-time import
 * cycle. No stand-in logic or seam markers remain, so a scan for seam markers in src is clean.
 */

import type { ServiceLine } from "@/contracts/common";

export interface LeadBrief {
  brief: string | null;
  keyFindingIds: string[];
  suggestedAngleId: string | null;
  score: number | null;
  scoreReasons: { ruleId: string; points: number; label: string }[];
}

/** SEAM-LEAD-BRIEF → Phase 11 scoring. */
export async function getLeadBrief(leadId: string): Promise<LeadBrief> {
  const { getLeadBrief: real } = await import("@/modules/acquisition/scoring");
  return real(leadId);
}

export interface OutreachThrottle {
  mode: "NORMAL" | "SLOW" | "PAUSED";
  newFirstTouchesToday: number;
  reason: string;
}

/** SEAM-THROTTLE → Phase 11 scoring. */
export async function getOutreachThrottle(line: ServiceLine): Promise<OutreachThrottle> {
  const { getOutreachThrottle: real } = await import("@/modules/acquisition/scoring");
  return real(line);
}

export interface CrossSellContext {
  groupId: string | null;
  isLeading: boolean;
  leadingLeadId: string | null;
  lines: ServiceLine[];
}

/** SEAM-CROSSSELL → Phase 11 cross-sell. */
export async function getCrossSellContext(leadId: string): Promise<CrossSellContext> {
  const { getCrossSellContext: real } = await import("@/modules/acquisition/crosssell");
  return real(leadId);
}

/** SEAM-BOOKING-LINK → Phase 14 pipeline (lazy to avoid the outreach ↔ pipeline cycle). */
export async function getBookingLink(leadId: string, ownerId?: string): Promise<string> {
  const { getBookingLink: real } = await import("@/modules/acquisition/pipeline");
  return real(leadId, ownerId);
}
