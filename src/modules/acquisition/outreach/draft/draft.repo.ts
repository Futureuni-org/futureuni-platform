import "server-only";

/**
 * Reads the drafting context (lead, company, contact, pitchable findings). DB access lives only in
 * `*.repo.ts`. Findings are ordered most-severe first and never include dismissed ones (INV-18).
 */

import { dbOr, type Prisma, type Tx } from "@/platform/db";
import { SEVERITY_ORDER } from "@/contracts/common";

const LEAD_FOR_DRAFT_INCLUDE = {
  company: { select: { id: true, name: true, country: true, city: true, region: true } },
} satisfies Prisma.LeadInclude;

export type LeadForDraft = Prisma.LeadGetPayload<{ include: typeof LEAD_FOR_DRAFT_INCLUDE }>;

export function loadLeadForDraft(tx: Tx | null, leadId: string): Promise<LeadForDraft | null> {
  return dbOr(tx).lead.findUnique({ where: { id: leadId }, include: LEAD_FOR_DRAFT_INCLUDE });
}

export interface ContactForDraft {
  id: string;
  firstName: string | null;
  lastName: string | null;
  name: string | null;
  role: string | null;
  email: string | null;
  phone: string | null;
  whatsappStatus: string;
  linkedinUrl: string | null;
}

export async function findContactForDraft(
  tx: Tx | null,
  contactId: string,
): Promise<ContactForDraft | null> {
  const c = await dbOr(tx).contact.findUnique({
    where: { id: contactId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      name: true,
      role: true,
      email: true,
      phone: true,
      whatsappStatus: true,
      linkedinUrl: true,
    },
  });
  return c;
}

export interface PitchableFinding {
  id: string;
  checkId: string;
  severity: string;
  claim: string;
  evidence: string;
  sourceUrl: string | null;
}

/** Pitchable, non-dismissed findings for a lead, most-severe first, limited to `max`. */
export async function findPitchableFindings(
  tx: Tx | null,
  leadId: string,
  max: number,
): Promise<PitchableFinding[]> {
  const rows = await dbOr(tx).auditFinding.findMany({
    where: { leadId, pitchable: true, dismissedAt: null },
    select: { id: true, checkId: true, severity: true, claim: true, evidence: true, sourceUrl: true },
  });
  const ordered = rows.sort(
    (a, b) => SEVERITY_ORDER.indexOf(b.severity) - SEVERITY_ORDER.indexOf(a.severity),
  );
  return ordered.slice(0, max).map((f) => ({
    id: f.id,
    checkId: f.checkId,
    severity: f.severity,
    claim: f.claim,
    evidence: summariseEvidence(f.evidence),
    sourceUrl: f.sourceUrl,
  }));
}

/** Compact, human-readable evidence string from a finding's structured evidence JSON. */
function summariseEvidence(evidence: unknown): string {
  if (typeof evidence === "string") return evidence.slice(0, 500);
  if (evidence !== null && typeof evidence === "object") {
    const record = evidence as Record<string, unknown>;
    const summary = record.summary ?? record.detail ?? record.note ?? record.value;
    if (typeof summary === "string") return summary.slice(0, 500);
  }
  return JSON.stringify(evidence).slice(0, 500);
}
