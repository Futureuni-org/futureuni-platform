/**
 * Builds the immutable handoff snapshot (`HandoffContent`, contract `acquisition-records.ts`) and
 * its Markdown rendering for the delivery team (module spec §3.13 "Won"). Content comes from the
 * won deal, its proposal, the lead's findings and the meeting summaries. Money is per currency
 * (INV-11); placeholder portfolio never appears (INV-19, enforced upstream in the proposal).
 */

import "server-only";

import type { HandoffContent } from "@/contracts/acquisition-records";
import type { Currency, Market, ServiceLine } from "@/contracts/common";
import { formatMoney } from "@/lib/money";

import * as repo from "../pipeline.repo";

export interface BuildHandoffArgs {
  leadId: string;
  companyId: string;
  market: Market;
  services: ServiceLine[];
  valueMinor: number;
  currency: Currency;
  startDate: Date | null;
  paymentNotes: string;
  proposalId: string | null;
  keyFindingIds: string[];
  now: Date;
}

export async function buildHandoffContent(args: BuildHandoffArgs): Promise<HandoffContent> {
  const [company, contacts, findings, summaries, proposal] = await Promise.all([
    repo.getCompanySnapshot(args.companyId),
    repo.listCompanyContacts(args.companyId),
    repo.getFindingsForLead(args.leadId, args.keyFindingIds),
    repo.listMeetingSummariesForLead(args.leadId),
    args.proposalId === null ? Promise.resolve(null) : repo.getProposal(args.proposalId),
  ]);

  const scope: string[] = [];
  if (proposal !== null) {
    for (const line of proposal.lineItems) scope.push(`${line.description} ×${String(line.quantity)}`);
  }

  const files: HandoffContent["files"] = [];
  if (proposal?.pdfFileId != null) files.push({ fileObjectId: proposal.pdfFileId, label: "Proposal PDF" });

  return {
    company: {
      id: company?.id ?? args.companyId,
      name: company?.name ?? "the client",
      website: company?.website ?? null,
      country: company?.country ?? null,
      city: company?.city ?? null,
    },
    contacts: contacts.map((c) => ({ id: c.id, name: c.name, role: c.role, email: c.email, phone: c.phone })),
    market: args.market,
    services: args.services,
    scope: scope.slice(0, 30),
    timeline: {
      startDate: args.startDate === null ? null : args.startDate.toISOString().slice(0, 10),
      notes: args.startDate === null ? "Start date to be confirmed." : "",
    },
    value: { amountMinor: args.valueMinor, currency: args.currency },
    paymentNotes: args.paymentNotes,
    keyFindings: findings.slice(0, 10).map((f) => ({ findingId: f.id, claim: f.claim })),
    meetingSummaries: summaries.slice(0, 10).map((s) => ({
      meetingId: s.id,
      summary:
        s.summary !== null && typeof s.summary === "object"
          ? ((s.summary as { summary?: string }).summary ?? "")
          : "",
    })),
    files,
    proposalId: args.proposalId,
    snapshotAt: args.now.toISOString(),
  };
}

export function handoffToMarkdown(content: HandoffContent): string {
  const lines: string[] = [];
  lines.push(`# Handoff: ${content.company.name}`);
  lines.push("");
  lines.push(`**Market:** ${content.market}`);
  lines.push(`**Services:** ${content.services.join(", ")}`);
  lines.push(`**Value:** ${formatMoney(content.value, { showMinor: "always" })}`);
  if (content.timeline.startDate !== null) lines.push(`**Start date:** ${content.timeline.startDate}`);
  lines.push("");
  lines.push("## Contacts");
  for (const c of content.contacts) {
    lines.push(`- ${c.name ?? "Unnamed"}${c.role === null ? "" : ` (${c.role})`}${c.email === null ? "" : ` — ${c.email}`}`);
  }
  lines.push("");
  lines.push("## Scope and deliverables");
  for (const item of content.scope) lines.push(`- ${item}`);
  lines.push("");
  if (content.keyFindings.length > 0) {
    lines.push("## Key findings");
    for (const f of content.keyFindings) lines.push(`- ${f.claim}`);
    lines.push("");
  }
  if (content.meetingSummaries.length > 0) {
    lines.push("## Meeting summaries");
    for (const s of content.meetingSummaries) {
      if (s.summary !== "") lines.push(`- ${s.summary}`);
    }
    lines.push("");
  }
  if (content.paymentNotes !== "") {
    lines.push("## Payment notes");
    lines.push(content.paymentNotes);
    lines.push("");
  }
  return lines.join("\n");
}
