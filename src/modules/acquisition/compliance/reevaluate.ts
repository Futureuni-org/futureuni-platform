/**
 * Re-evaluate open Nigerian leads after `acquisition.compliance.ngDirectMarketingBasis` changes.
 * For each lead whose email verdict changed, update the lead and emit `compliance.verdict.changed`.
 */

import "server-only";

import type { JobResult } from "@/contracts/jobs";
import type { Contactability } from "@/contracts/enrichment";
import { db, toJsonInput, withTransaction } from "@/platform/db";
import { publishAfterCommit } from "@/platform/events";

import { getContactability } from "./contactability";

export async function reevaluateOpenLeads(): Promise<JobResult> {
  const openStatuses = [
    "NEW",
    "ENRICHING",
    "ENRICHED",
    "AUDITING",
    "AUDITED",
    "SCORED",
    "IN_REVIEW",
    "APPROVED",
    "CONTACTED",
    "REPLIED",
    "MEETING_BOOKED",
    "PROPOSAL_SENT",
    "NURTURE",
  ] as const;
  const leads = await db.lead.findMany({
    where: { market: "NIGERIA", status: { in: [...openStatuses] } },
    select: { id: true, companyId: true, primaryContactId: true, contactability: true },
  });

  let changed = 0;
  for (const lead of leads) {
    await withTransaction(async (tx) => {
      const verdict = await getContactability(tx, {
        companyId: lead.companyId,
        ...(lead.primaryContactId === null ? {} : { contactId: lead.primaryContactId }),
      });
      const previous = lead.contactability as Contactability | null;
      if (previous?.email.status === verdict.email.status && previous.email.ruleId === verdict.email.ruleId) return;
      const complianceReview = verdict.email.status === "CONSENT_REQUIRED" || verdict.email.status === "REVIEW";
      await tx.lead.update({
        where: { id: lead.id },
        data: {
          contactability: toJsonInput(verdict),
          contactabilityEvaluatedAt: new Date(),
          complianceReview,
        },
      });
      await publishAfterCommit(tx, {
        name: "compliance.verdict.changed",
        actor: { type: "SYSTEM", job: "acquisition.compliance.reevaluate" },
        payload: {
          leadId: lead.id,
          companyId: lead.companyId,
          contactId: lead.primaryContactId,
          emailFrom: previous?.email.status ?? null,
          emailTo: verdict.email.status,
        },
      });
      changed += 1;
    });
  }
  return { counts: { checked: leads.length, changed } };
}
