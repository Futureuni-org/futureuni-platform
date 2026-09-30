/**
 * `enrichLead` (Phase 9): the enrichment pipeline that turns a `NEW` lead into an `ENRICHED`
 * lead (or `SUPPRESSED`/`DISQUALIFIED` when compliance blocks it). Every step is small and
 * idempotent so a retried run resumes without duplicating work.
 */

import "server-only";

import type { Actor } from "@/contracts/common";
import { AppError } from "@/lib/errors";
import { getContactability } from "@/modules/acquisition/compliance/contactability";
import { detectNgLegalForm, detectUkLegalForm } from "@/modules/acquisition/compliance/legal-form";
import { findSuppressions, transitionLead } from "@/modules/acquisition/core";
import { db, toJsonInput, withTransaction } from "@/platform/db";
import { publishAfterCommit } from "@/platform/events";
import { safeFetch } from "@/platform/http";

import { crawlCompany } from "./crawler";

export interface EnrichLeadInput {
  leadId: string;
  actor: Actor;
  jobRunId?: string;
}

export interface EnrichLeadResult {
  leadId: string;
  status: "ENRICHED" | "SUPPRESSED" | "DISQUALIFIED";
  pagesFetched: number;
  emailsFound: number;
  phonesFound: number;
  legalForm: string;
  emailVerdict: string;
}

export async function enrichLead(input: EnrichLeadInput): Promise<EnrichLeadResult> {
  const lead = await db.lead.findUnique({
    where: { id: input.leadId },
    select: { id: true, status: true, companyId: true, primaryContactId: true, serviceLine: true, market: true, country: true },
  });
  if (lead === null) throw new AppError("NOT_FOUND", `Lead ${input.leadId} not found.`);

  // Only NEW → ENRICHING here. A lead in another state is a no-op (idempotent retry-safe).
  if (lead.status === "ENRICHED" || lead.status === "SUPPRESSED" || lead.status === "DISQUALIFIED") {
    return await buildFinalResult(input.leadId);
  }

  await withTransaction(async (tx) => {
    if (lead.status === "NEW") {
      await transitionLead(tx, { leadId: input.leadId, to: "ENRICHING", actor: input.actor, reason: "enrichment:start" });
    }
  });

  const company = await db.company.findUniqueOrThrow({
    where: { id: lead.companyId },
    select: { id: true, name: true, website: true, normalizedDomain: true, country: true, city: true, postcode: true, primaryPhone: true, legalForm: true },
  });

  // 1. Crawl
  const clock = { now: () => new Date() };
  const abort = new AbortController();
  const context = {
    leadId: input.leadId,
    companyId: company.id,
    serviceLine: lead.serviceLine,
    market: lead.market,
    actor: input.actor,
    safeFetch,
    now: clock.now,
    signal: abort.signal,
    budget: { tryCharge: () => true },
  };
  const crawlResult = await crawlCompany(
    { id: company.id, name: company.name, website: company.website, normalizedDomain: company.normalizedDomain, country: company.country },
    context,
  );

  // 2. Detect legal form for the UK and Nigeria.
  let legalFormDetection = null;
  if (company.country === "GB") {
    legalFormDetection = await detectUkLegalForm(
      { name: company.name, city: company.city, postcode: company.postcode },
      crawlResult.legalFormHints,
    );
  } else if (company.country === "NG") {
    legalFormDetection = detectNgLegalForm(crawlResult.legalFormHints);
  }

  await withTransaction(async (tx) => {
    // Update the Company row from what we learned. Never blank out verified data.
    await tx.company.update({
      where: { id: company.id },
      data: {
        crawlStatus: crawlResult.crawlStatus ?? "PARTIAL",
        lastCrawledAt: new Date(),
        lastEnrichedAt: new Date(),
        ...(crawlResult.socials !== undefined ? { socials: toJsonInput(crawlResult.socials) } : {}),
        ...(crawlResult.techHints !== undefined ? { techHints: toJsonInput(crawlResult.techHints) } : {}),
        ...(legalFormDetection !== null
          ? {
              legalForm: legalFormDetection.legalForm,
              legalFormSource: legalFormDetection.source,
              legalFormConfidence: legalFormDetection.confidence,
              ...(legalFormDetection.companyNumber === undefined ? {} : { companyNumber: legalFormDetection.companyNumber }),
            }
          : {}),
      },
    });

    // Upsert each extracted contact-email. We don't yet know their names, so store them as
    // Contact rows with the email set; the AI pick-contact step later chooses the primary.
    for (const found of crawlResult.emails) {
      const existing = await tx.contact.findFirst({
        where: { companyId: company.id, email: found.email, deletedAt: null },
        select: { id: true },
      });
      if (existing !== null) continue;
      await tx.contact.create({
        data: {
          companyId: company.id,
          email: found.email,
          emailType: found.kind,
          emailStatus: "UNVERIFIED",
          source: `crawl:${found.source}`,
          ...(found.pageUrl === undefined ? {} : { sourceUrl: found.pageUrl }),
        },
      });
    }

    // If the crawl found phone numbers but no contacts had them, store them on the company.
    if (crawlResult.phones.length > 0) {
      const seen = new Set(company.primaryPhone === null ? [] : [company.primaryPhone]);
      const phones = crawlResult.phones.map((p) => p.e164).filter((p) => {
        if (seen.has(p)) return false;
        seen.add(p);
        return true;
      });
      if (phones.length > 0 || company.primaryPhone === null) {
        await tx.company.update({
          where: { id: company.id },
          data: {
            phones: phones,
            ...(company.primaryPhone === null && phones[0] !== undefined ? { primaryPhone: phones[0] } : {}),
          },
        });
      }
    }
  });

  // 3. Contactability + terminal transition.
  const verdict = await getContactability(null, {
    companyId: company.id,
    ...(lead.primaryContactId === null ? {} : { contactId: lead.primaryContactId }),
  });

  const suppressions = await findSuppressions(null, {
    ...(company.normalizedDomain === null ? {} : { domain: company.normalizedDomain }),
  });
  const suppressed = suppressions.length > 0;

  const complianceReview = verdict.email.status === "CONSENT_REQUIRED" || verdict.email.status === "REVIEW";

  let finalStatus: "ENRICHED" | "SUPPRESSED" | "DISQUALIFIED" = "ENRICHED";

  await withTransaction(async (tx) => {
    await tx.lead.update({
      where: { id: input.leadId },
      data: {
        contactability: toJsonInput(verdict),
        contactabilityEvaluatedAt: new Date(),
        complianceReview,
      },
    });

    if (suppressed) {
      await transitionLead(tx, { leadId: input.leadId, to: "SUPPRESSED", actor: input.actor, reason: "compliance:suppressed" });
      finalStatus = "SUPPRESSED";
    } else if (verdict.email.status === "BLOCKED" && verdict.email.ruleId?.endsWith(".prohibited") === true) {
      await transitionLead(tx, {
        leadId: input.leadId,
        to: "DISQUALIFIED",
        actor: input.actor,
        reason: `compliance:${verdict.email.ruleId}`,
      });
      finalStatus = "DISQUALIFIED";
    } else {
      await transitionLead(tx, { leadId: input.leadId, to: "ENRICHED", actor: input.actor, reason: "enrichment:done" });
    }

    await publishAfterCommit(tx, {
      name: "compliance.verdict.changed",
      actor: input.actor,
      payload: {
        leadId: input.leadId,
        companyId: company.id,
        contactId: lead.primaryContactId,
        emailFrom: null,
        emailTo: verdict.email.status,
      },
    });
  });

  return {
    leadId: input.leadId,
    status: finalStatus,
    pagesFetched: crawlResult.pagesFetched,
    emailsFound: crawlResult.emails.length,
    phonesFound: crawlResult.phones.length,
    legalForm: legalFormDetection?.legalForm ?? company.legalForm,
    emailVerdict: verdict.email.status,
  };
}

async function buildFinalResult(leadId: string): Promise<EnrichLeadResult> {
  const lead = await db.lead.findUniqueOrThrow({
    where: { id: leadId },
    select: { id: true, status: true, company: { select: { legalForm: true } }, contactability: true },
  });
  const contactability = lead.contactability as { email?: { status: string } } | null;
  return {
    leadId,
    status: (lead.status as "ENRICHED" | "SUPPRESSED" | "DISQUALIFIED"),
    pagesFetched: 0,
    emailsFound: 0,
    phonesFound: 0,
    legalForm: lead.company.legalForm,
    emailVerdict: contactability?.email?.status ?? "REVIEW",
  };
}
