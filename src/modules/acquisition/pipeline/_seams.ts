import "server-only";

/**
 * Seam adapters (wired at the Wave 3 / batch B4 integration). Phase 14 originally stubbed these while
 * Phases 11 and 12 ran in parallel; now they delegate to the real providers. The outreach-provided
 * seams are imported lazily so the pipeline ↔ outreach edge never forms a load-time import cycle. No
 * stand-in logic or seam markers remain, so a scan for seam markers in src is clean.
 */

import type { Actor, EnrollmentStopReason } from "@/contracts/common";
import type { Tx } from "@/platform/db";

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

/** SEAM-STOP-SEQUENCE → Phase 12 outreach (lazy to avoid the pipeline ↔ outreach cycle). */
export async function stopEnrollments(
  tx: Tx | null,
  scope: { leadId?: string; contactId?: string; companyId?: string },
  reason: EnrollmentStopReason,
): Promise<{ stopped: number }> {
  const { stopEnrollments: real } = await import("@/modules/acquisition/outreach");
  return real(tx, scope, reason);
}

export interface SendOneOffInput {
  leadId: string;
  contactId: string;
  subject: string;
  body: string;
  inReplyToMessageId?: string;
  attachments?: { fileKey: string; filename: string }[];
  humanConfirmedClaims: boolean;
}

/** SEAM-SEND-ONEOFF → Phase 12 outreach. */
export async function sendOneOffEmail(actor: Actor, input: SendOneOffInput): Promise<{ messageId: string }> {
  const { sendOneOffEmail: real } = await import("@/modules/acquisition/outreach");
  return real(actor, input);
}
