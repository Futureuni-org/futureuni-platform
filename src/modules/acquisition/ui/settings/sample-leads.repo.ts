import "server-only";

/**
 * Sample leads for the scoring live-preview (Phase 18 profile editor). Picks a handful of already
 * scored leads for a line and builds the pure `ScoringFacts` for each, so the editor can re-run
 * `scoreLead` with the DRAFT scoring config and show current-vs-draft scores.
 *
 * Phase 11's `loadScoringInputs` is not exported from `@/modules/acquisition/scoring`, so this
 * `*.repo.ts` (allowed by the DB-access naming rule) loads the same rows and composes facts via the
 * pure `buildScoringFacts` + compliance's `getContactability`. See CR-18-GAP-SAMPLE-LEADS in
 * phases/18/REQUESTS.md — Phase 11 should export a sample-lead/facts selector.
 */

import type { ScoreBand, ServiceLine } from "@/contracts/common";
import type { ScoringFacts } from "@/contracts/service-line-profile";
import { db } from "@/platform/db";
import { buildScoringFacts } from "@/modules/acquisition/scoring";
import { getContactability } from "@/modules/acquisition/compliance";

export interface SampleLead {
  leadId: string;
  companyName: string;
  currentScore: number | null;
  currentBand: ScoreBand | null;
  facts: ScoringFacts;
}

/** Leads currently held in NURTURE for a line (the capacity panel's "held in nurture"). */
export async function countNurtureHeld(line: ServiceLine): Promise<number> {
  return db.lead.count({ where: { serviceLine: line, status: "NURTURE" } });
}

/** Scored leads for a line, newest score first — the pool the preview samples from. */
export async function getSampleLeadsForLine(line: ServiceLine, limit = 8): Promise<SampleLead[]> {
  const leads = await db.lead.findMany({
    where: { serviceLine: line, score: { not: null } },
    orderBy: [{ scoredAt: "desc" }, { id: "desc" }],
    take: Math.min(Math.max(limit, 1), 20),
    select: {
      id: true,
      market: true,
      country: true,
      companyId: true,
      primaryContactId: true,
      score: true,
      scoreBand: true,
    },
  });

  const samples = await Promise.all(
    leads.map(async (lead) => {
      const [company, primaryContact, signals, findings, contactability] = await Promise.all([
        db.company.findUniqueOrThrow({
          where: { id: lead.companyId },
          select: {
            name: true,
            legalForm: true,
            sizeRange: true,
            websiteKind: true,
            website: true,
            industry: true,
            isActiveClient: true,
            copyrightYear: true,
          },
        }),
        lead.primaryContactId === null
          ? Promise.resolve(null)
          : db.contact.findUnique({
              where: { id: lead.primaryContactId },
              select: { emailStatus: true, emailType: true, whatsappStatus: true, seniority: true },
            }),
        db.signal.findMany({
          where: { leadId: lead.id, serviceLine: line },
          select: { id: true, signalType: true },
        }),
        db.auditFinding.findMany({
          where: { leadId: lead.id },
          select: { id: true, checkId: true, severity: true, pitchable: true, dismissedAt: true },
        }),
        getContactability(null, {
          companyId: lead.companyId,
          ...(lead.primaryContactId === null ? {} : { contactId: lead.primaryContactId }),
        }),
      ]);

      const facts = buildScoringFacts({
        lead: { market: lead.market, country: lead.country },
        company,
        primaryContact,
        signals,
        findings,
        contactability,
      });

      return {
        leadId: lead.id,
        companyName: company.name,
        currentScore: lead.score,
        currentBand: lead.scoreBand,
        facts,
      } satisfies SampleLead;
    }),
  );

  return samples;
}
