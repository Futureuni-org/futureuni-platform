/**
 * Acquisition retention purge (Phase 9). Called by the `acquisition.compliance.retention-purge`
 * job; anonymises personal data on DISQUALIFIED and LOST leads older than the retention setting
 * (default 12 months). Dry-run mode counts what would be purged without changing anything.
 */

import "server-only";

import type { Actor } from "@/contracts/common";
import { assertActorCan } from "@/platform/auth";
import { audit } from "@/platform/audit-log";
import { db, withTransaction } from "@/platform/db";
import { getSetting } from "@/platform/settings";

export interface RetentionPurgeResult {
  cutoff: string;
  candidates: number;
  anonymisedContacts: number;
  notesErased: number;
  dryRun: boolean;
}

export async function runAcquisitionRetentionPurge(actor: Actor, opts: { dryRun?: boolean } = {}): Promise<RetentionPurgeResult> {
  if (opts.dryRun === true) {
    await assertActorCan(actor, "acquisition.retention.preview");
  }
  const months = await getSetting<number>("platform.retention.personalDataMonths");
  const cutoff = new Date(Date.now() - months * 30 * 24 * 60 * 60 * 1000);
  const closedStatuses: readonly ("DISQUALIFIED" | "LOST")[] = ["DISQUALIFIED", "LOST"];
  const closedLeads = await db.lead.findMany({
    where: {
      status: { in: [...closedStatuses] },
      closedAt: { lt: cutoff },
    },
    select: { id: true, companyId: true, primaryContactId: true },
  });
  if (opts.dryRun === true) {
    return { cutoff: cutoff.toISOString(), candidates: closedLeads.length, anonymisedContacts: 0, notesErased: 0, dryRun: true };
  }

  let anonymisedContacts = 0;
  let notesErased = 0;
  await withTransaction(async (tx) => {
    for (const lead of closedLeads) {
      // Anonymise the primary contact; other contacts stay unless every referring lead is closed.
      const contactId = lead.primaryContactId;
      if (contactId === null) continue;
      const otherOpenLeads = await tx.lead.count({
        where: {
          primaryContactId: contactId,
          NOT: { status: { in: [...closedStatuses] } },
        },
      });
      if (otherOpenLeads > 0) continue;
      await tx.contact.update({
        where: { id: contactId },
        data: {
          name: null,
          firstName: null,
          lastName: null,
          email: null,
          emailStatus: "UNVERIFIED",
          phone: null,
          linkedinUrl: null,
          isAnonymized: true,
          anonymizedAt: new Date(),
        },
      });
      anonymisedContacts += 1;
      const noteResult = await tx.note.updateMany({
        where: { targetType: "Contact", targetId: contactId },
        data: { body: "[erased for retention]" },
      });
      notesErased += noteResult.count;
    }
    await audit.record(tx, {
      actor,
      action: "acquisition.retention.preview",
      targetType: "AcquisitionRetentionPurge",
      targetId: cutoff.toISOString(),
      after: { candidates: closedLeads.length, anonymisedContacts, notesErased },
    });
  });

  return { cutoff: cutoff.toISOString(), candidates: closedLeads.length, anonymisedContacts, notesErased, dryRun: false };
}
