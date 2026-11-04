import "server-only";

/**
 * Pick the lead's primary contact (Phase 9 step 5, module spec §435). Candidates are the
 * company's contacts that have a crawled email not marked INVALID — crawled, not guessed, so
 * enrichment contract rule 11 (no pattern-guessed personal emails without verification) is not
 * in play. One candidate is set directly; several go through the
 * `acquisition.enrich-pick-contact` AI task with the profile's `contactRolePriority`, and a
 * provider failure or an id the task invented falls back to a deterministic order so the
 * pipeline never stalls on the pick.
 */

import type { Actor } from "@/contracts/common";
import { db } from "@/platform/db";

import type { PickContactTaskInput, PickContactTaskOutput } from "./tasks";

type Candidate = PickContactTaskInput["candidates"][number];

interface CandidateRow {
  id: string;
  name: string | null;
  role: string | null;
  emailStatus: string; // Prisma EmailStatus: UNVERIFIED | VALID | RISKY | INVALID
  emailType: "PERSONAL" | "ROLE" | null;
  source: string;
}

const STATUS_RANK: Record<string, number> = { VALID: 3, RISKY: 2, UNVERIFIED: 1 };

/** Deterministic fallback order: verified first, then personal over role addresses. */
export function pickDeterministic<T extends Pick<CandidateRow, "emailStatus" | "emailType">>(
  candidates: readonly T[],
): T | null {
  let best: T | null = null;
  let bestScore = -1;
  for (const candidate of candidates) {
    const score =
      (STATUS_RANK[candidate.emailStatus] ?? 0) * 10 + (candidate.emailType === "PERSONAL" ? 1 : 0);
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return best;
}

/**
 * Ensures the lead has a primary contact and returns its id (null when the company has no
 * emailable contact). Already-set leads are left alone, so the call is idempotent and safe
 * from both the enrichment pipeline and the advance workflow's draft step.
 */
export async function ensurePrimaryContact(leadId: string, actor: Actor): Promise<string | null> {
  const lead = await db.lead.findUnique({
    where: { id: leadId },
    select: { id: true, serviceLine: true, market: true, companyId: true, primaryContactId: true },
  });
  if (lead === null) return null;
  if (lead.primaryContactId !== null) return lead.primaryContactId;

  const rows: CandidateRow[] = await db.contact.findMany({
    where: {
      companyId: lead.companyId,
      deletedAt: null,
      email: { not: null },
      emailStatus: { not: "INVALID" },
    },
    select: { id: true, name: true, role: true, emailStatus: true, emailType: true, source: true },
    orderBy: { collectedAt: "asc" },
    take: 20,
  });
  if (rows.length === 0) return null;

  let chosen = rows.length === 1 ? rows[0] : null;

  if (chosen === null) {
    try {
      // Lazy imports: the AI registry boots from the module manifests, which import this module,
      // so a top-level `@/platform/ai` import here would close an import cycle and break boot.
      const [{ runTask }, { getActiveProfile }] = await Promise.all([
        import("@/platform/ai"),
        import("@/modules/acquisition/profiles"),
      ]);
      const company = await db.company.findUnique({
        where: { id: lead.companyId },
        select: { sizeRange: true },
      });
      const profile = await getActiveProfile(lead.serviceLine);
      const candidates: Candidate[] = rows.map((row) => ({
        id: row.id,
        name: row.name,
        role: row.role,
        emailStatus: (STATUS_RANK[row.emailStatus] === undefined && row.emailStatus !== "INVALID"
          ? "UNKNOWN"
          : row.emailStatus) as Candidate["emailStatus"],
        emailKind: row.emailType,
        source: row.source,
      }));
      const result = await runTask<PickContactTaskInput, PickContactTaskOutput>({
        task: "acquisition.enrich-pick-contact",
        input: {
          serviceLine: lead.serviceLine,
          market: lead.market,
          size: company?.sizeRange ?? "UNKNOWN",
          candidates,
          rolePriority: profile.contactRolePriority,
        },
        actor,
        context: { leadId: lead.id, companyId: lead.companyId, module: "acquisition" },
      });
      chosen = rows.find((row) => row.id === result.output.primaryContactId) ?? null;
    } catch {
      chosen = null; // AI unavailable or invalid: the deterministic order below decides.
    }
  }

  chosen = chosen ?? pickDeterministic(rows);
  if (chosen === null) return null;

  await db.lead.update({ where: { id: lead.id }, data: { primaryContactId: chosen.id } });
  return chosen.id;
}
