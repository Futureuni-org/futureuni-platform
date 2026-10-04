import "server-only";

/**
 * Minimal lead cards for the Search live panel and run page. `getSearchRun` returns only `leadIds`,
 * and Phase 16's `listLeads` reader is not available to Phase 15 in parallel, so this `*.repo.ts`
 * (allowed by the DB-access naming rule) reads just the few fields a card needs. See
 * phases/15/REQUESTS.md — a shared minimal lead reader would remove this.
 */

import { db } from "@/platform/db";

import type { RunLeadCard } from "./view";

export async function getRunLeadCards(leadIds: readonly string[]): Promise<RunLeadCard[]> {
  if (leadIds.length === 0) return [];
  const leads = await db.lead.findMany({
    where: { id: { in: [...leadIds] } },
    select: {
      id: true,
      market: true,
      score: true,
      company: { select: { name: true, country: true } },
      signals: { select: { signalType: true }, orderBy: { observedAt: "desc" }, take: 1 },
    },
  });
  const byId = new Map(leads.map((lead) => [lead.id, lead]));
  return leadIds.flatMap((id) => {
    const lead = byId.get(id);
    if (lead === undefined) return [];
    return [
      {
        id: lead.id,
        companyName: lead.company.name,
        country: lead.company.country,
        market: lead.market,
        score: lead.score,
        signalType: lead.signals[0]?.signalType ?? null,
      },
    ];
  });
}
