import "server-only";

/**
 * Lead meta the review-context action needs for authorisation (owner, line) and for the few fields
 * the services don't surface (company website, the primary contact's WhatsApp confidence and
 * LinkedIn URL). Allowed here by the DB-access naming rule.
 */

import type { ServiceLine } from "@/contracts/common";
import { db } from "@/platform/db";

export interface ReviewLeadMeta {
  ownerId: string | null;
  serviceLine: ServiceLine;
  companyId: string;
  primaryContactId: string | null;
  companyWebsite: string | null;
  whatsappConfidence: "CONFIRMED" | "LIKELY" | null;
  linkedinUrl: string | null;
}

export async function getReviewLeadMeta(leadId: string): Promise<ReviewLeadMeta | null> {
  const lead = await db.lead.findUnique({
    where: { id: leadId },
    select: {
      ownerId: true,
      serviceLine: true,
      companyId: true,
      primaryContactId: true,
      company: { select: { website: true } },
      primaryContact: { select: { whatsappStatus: true, linkedinUrl: true } },
    },
  });
  if (lead === null) return null;
  const ws = lead.primaryContact?.whatsappStatus;
  return {
    ownerId: lead.ownerId,
    serviceLine: lead.serviceLine,
    companyId: lead.companyId,
    primaryContactId: lead.primaryContactId,
    companyWebsite: lead.company.website,
    whatsappConfidence: ws === "CONFIRMED" ? "CONFIRMED" : ws === "LIKELY" ? "LIKELY" : null,
    linkedinUrl: lead.primaryContact?.linkedinUrl ?? null,
  };
}
