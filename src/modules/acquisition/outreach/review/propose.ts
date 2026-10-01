import "server-only";

/**
 * Provided seam SEAM-PROPOSE-ENROLLMENT (wave-3 guide Part B2). For referrals and re-engagement: it
 * creates a review-queue draft for a new contact, never an automatic send. Returns the draft id, or
 * null when drafting was skipped (for example a held cross-sell lead).
 */

import type { Actor } from "@/contracts/common";

import { createDraft } from "../draft/draft";

export interface ProposeEnrollmentInput {
  leadId: string;
  contactId: string;
  reason: "REFERRAL" | "RE_ENGAGE";
}

export async function proposeEnrollment(actor: Actor, input: ProposeEnrollmentInput): Promise<{ draftMessageId: string | null }> {
  const result = await createDraft(actor, { leadId: input.leadId, contactId: input.contactId, stepIndex: 0, transition: false });
  return { draftMessageId: result.status === "created" ? result.messageId : null };
}
