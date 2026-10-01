import "server-only";

/**
 * One-click unsubscribe processing (step 6; INV-23). Verifies the signed token, suppresses the
 * email (and the domain for a COMPANY-scope unsubscribe, skipping webmail), stops the company's or
 * contact's enrolments, and moves the matching open leads to SUPPRESSED. Idempotent and never
 * answered with a message. No session is required; the route verifies the token itself.
 *
 * The suppression cascade runs directly here (a public, actor-less entrypoint), mirroring the
 * compliance INV-3 cascade; see phases/12/REQUESTS.md for the integration note.
 */

import type { Actor } from "@/contracts/common";
import { isUniqueViolation, withSavepoint, withTransaction, type Prisma, type Tx } from "@/platform/db";
import { normalizeSuppressionValue, transitionLead } from "@/modules/acquisition/core";

import { stopEnrollments } from "../sequences/stop";
import { verifyUnsubscribeToken } from "./tokens";

const UNSUB_ACTOR: Actor = { type: "SYSTEM", job: "acquisition.outreach.unsubscribe" };

const WEBMAIL_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "live.com",
  "yahoo.com", "yahoo.co.uk", "icloud.com", "me.com", "aol.com", "proton.me", "protonmail.com",
]);

const OPEN_LEAD_STATUSES = [
  "NEW", "ENRICHING", "ENRICHED", "AUDITING", "AUDITED", "SCORED", "IN_REVIEW", "APPROVED",
  "CONTACTED", "REPLIED", "MEETING_BOOKED", "PROPOSAL_SENT", "NURTURE",
] as const;

export interface UnsubscribeResult {
  ok: boolean;
  alreadyDone: boolean;
}

/** Verifies the token and applies the unsubscribe. Returns ok:false only for an invalid/revoked token. */
export async function processUnsubscribe(token: string, options: { reason?: string } = {}): Promise<UnsubscribeResult> {
  const payload = verifyUnsubscribeToken(token);
  if (payload === null) return { ok: false, alreadyDone: false };

  return withTransaction(async (tx) => {
    const message = await tx.message.findUnique({
      where: { id: payload.mid },
      select: {
        unsubscribeTokenId: true,
        unsubscribeRevokedAt: true,
        companyId: true,
        contactId: true,
        contact: { select: { id: true, email: true } },
        company: { select: { id: true, normalizedDomain: true } },
      },
    });
    if (message === null) return { ok: false, alreadyDone: false };
    if (message.unsubscribeRevokedAt !== null) return { ok: false, alreadyDone: false };
    // A set token id must match (a mismatch means a stale/forged token for this message).
    if (message.unsubscribeTokenId !== null && message.unsubscribeTokenId !== payload.tid) {
      return { ok: false, alreadyDone: false };
    }

    const email = message.contact?.email ?? null;
    const normalisedEmail = email === null ? null : normalizeSuppressionValue("EMAIL", email) ?? email.toLowerCase();
    const companyId = message.companyId;
    const contactId = payload.cid;

    const reason = options.reason?.trim().slice(0, 500);
    let addedAny = false;
    if (normalisedEmail !== null) {
      addedAny = (await insertSuppression(tx, "EMAIL", normalisedEmail, "ONE_CLICK", reason)) || addedAny;
      // When the token was already used, still attach a late reason to the existing row.
      if (!addedAny && reason !== undefined && reason !== "") {
        await tx.suppression.updateMany({ where: { type: "EMAIL", value: normalisedEmail, removedAt: null }, data: { note: reason } });
      }
    }

    const domain = message.company.normalizedDomain;
    const emailDomain = normalisedEmail?.split("@")[1] ?? null;
    if (payload.scope === "COMPANY" && domain !== null && (emailDomain === null || !WEBMAIL_DOMAINS.has(emailDomain))) {
      const normalisedDomain = normalizeSuppressionValue("DOMAIN", domain) ?? domain.toLowerCase();
      addedAny = (await insertSuppression(tx, "DOMAIN", normalisedDomain, "ONE_CLICK")) || addedAny;
    }

    // Stop enrolments (INV-3) and suppress matching open leads.
    if (payload.scope === "COMPANY") {
      await stopEnrollments(tx, { companyId }, "UNSUBSCRIBE");
      await suppressOpenLeads(tx, { companyId });
    } else {
      await stopEnrollments(tx, { contactId }, "UNSUBSCRIBE");
      await suppressOpenLeads(tx, { contactId });
    }

    return { ok: true, alreadyDone: !addedAny };
  });
}

async function insertSuppression(
  tx: Tx,
  type: "EMAIL" | "DOMAIN",
  value: string,
  source: "ONE_CLICK",
  note?: string,
): Promise<boolean> {
  try {
    // A savepoint keeps the outer transaction usable if the insert hits the partial unique index.
    await withSavepoint(tx, () =>
      tx.suppression.create({
        data: { type, value, reason: "UNSUBSCRIBE", source, ...(note === undefined || note === "" ? {} : { note }) },
      }),
    );
    return true;
  } catch (error) {
    if (isUniqueViolation(error)) return false;
    throw error;
  }
}

async function suppressOpenLeads(tx: Tx, scope: { companyId?: string; contactId?: string }): Promise<void> {
  const where: Prisma.LeadWhereInput = { status: { in: [...OPEN_LEAD_STATUSES] } };
  if (scope.companyId !== undefined) where.companyId = scope.companyId;
  else if (scope.contactId !== undefined) where.primaryContactId = scope.contactId;
  const leads = await tx.lead.findMany({ where, select: { id: true } });
  for (const lead of leads) {
    await transitionLead(tx, { leadId: lead.id, to: "SUPPRESSED", actor: UNSUB_ACTOR, reason: "unsubscribe" });
  }
}
