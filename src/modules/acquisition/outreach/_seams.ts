import "server-only";

/**
 * Consumed-seam stand-ins (wave-3 guide Part B2). Phases 11 and 14 run in parallel with Phase 12,
 * so these are temporary implementations behind the exact seam signatures. At Wave 3 integration
 * each stub is deleted and the call is pointed at the real provider (see `phases/12/REQUESTS.md`);
 * `grep -r "SEAM:" src` must then be clean for these IDs.
 */

import type { ServiceLine } from "@/contracts/common";
import { db } from "@/platform/db";

export interface LeadBrief {
  brief: string | null;
  keyFindingIds: string[];
  suggestedAngleId: string | null;
  score: number | null;
  scoreReasons: { ruleId: string; points: number; label: string }[];
}

// SEAM:SEAM-LEAD-BRIEF (provider: Phase 11). Stand-in reads Lead.brief + Lead.scoreReasons.
export async function getLeadBrief(leadId: string): Promise<LeadBrief> {
  const lead = await db.lead.findUnique({
    where: { id: leadId },
    select: { brief: true, keyFindingIds: true, suggestedAngleId: true, score: true, scoreReasons: true },
  });
  if (lead === null) {
    return { brief: null, keyFindingIds: [], suggestedAngleId: null, score: null, scoreReasons: [] };
  }
  const raw: unknown[] = Array.isArray(lead.scoreReasons) ? lead.scoreReasons : [];
  const scoreReasons = raw.flatMap((r) => {
    if (r === null || typeof r !== "object") return [];
    const rec = r as Record<string, unknown>;
    if (typeof rec.ruleId !== "string") return [];
    return [
      {
        ruleId: rec.ruleId,
        points: typeof rec.points === "number" ? rec.points : 0,
        label: typeof rec.label === "string" ? rec.label : rec.ruleId,
      },
    ];
  });
  return {
    brief: lead.brief,
    keyFindingIds: lead.keyFindingIds,
    suggestedAngleId: lead.suggestedAngleId,
    score: lead.score,
    scoreReasons,
  };
}

export interface OutreachThrottle {
  mode: "NORMAL" | "SLOW" | "PAUSED";
  newFirstTouchesToday: number;
  reason: string;
}

// SEAM:SEAM-THROTTLE (provider: Phase 11). Stand-in never throttles.
export async function getOutreachThrottle(line: ServiceLine): Promise<OutreachThrottle> {
  return Promise.resolve({ mode: "NORMAL", newFirstTouchesToday: Number.POSITIVE_INFINITY, reason: `no throttle (${line})` });
}

export interface CrossSellContext {
  groupId: string | null;
  isLeading: boolean;
  leadingLeadId: string | null;
  lines: ServiceLine[];
}

// SEAM:SEAM-CROSSSELL (provider: Phase 11). Stand-in reads CrossSellGroup rows.
export async function getCrossSellContext(leadId: string): Promise<CrossSellContext> {
  const lead = await db.lead.findUnique({
    where: { id: leadId },
    select: { crossSellGroupId: true, heldByCrossSell: true },
  });
  // No lead or no group: a lone lead leads itself.
  if (lead === null) {
    return { groupId: null, isLeading: true, leadingLeadId: leadId, lines: [] };
  }
  if (lead.crossSellGroupId === null) {
    return { groupId: null, isLeading: !lead.heldByCrossSell, leadingLeadId: leadId, lines: [] };
  }
  const group = await db.crossSellGroup.findUnique({
    where: { id: lead.crossSellGroupId },
    select: { id: true, leadingLeadId: true, leads: { select: { serviceLine: true } } },
  });
  if (group === null) {
    return { groupId: null, isLeading: !lead.heldByCrossSell, leadingLeadId: leadId, lines: [] };
  }
  const lines = [...new Set(group.leads.map((l) => l.serviceLine))];
  return {
    groupId: group.id,
    isLeading: group.leadingLeadId === leadId,
    leadingLeadId: group.leadingLeadId,
    lines,
  };
}

// SEAM:SEAM-BOOKING-LINK (provider: Phase 14). Stand-in returns the default booking URL + ?lead=<id>.
export async function getBookingLink(leadId: string, ownerId?: string): Promise<string> {
  let base = "";
  try {
    const { getSetting } = await import("@/platform/settings");
    base = await getSetting<string>("acquisition.defaultBookingUrl");
  } catch {
    base = "";
  }
  if (base === "") {
    // Best-effort fallback so a draft that wants a booking link still has a value in the stub phase.
    base = "https://cal.com/futureuni";
  }
  const separator = base.includes("?") ? "&" : "?";
  const owner = ownerId === undefined ? "" : `&owner=${ownerId}`;
  return `${base}${separator}lead=${leadId}${owner}`;
}
