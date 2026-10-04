import "server-only";

/**
 * The live proposals of every lead on the board, in one query. The pipeline service's cards carry
 * only an estimated value, but the board needs to know whether a lead has a proposal (the
 * "Proposal sent" drop rule) and which ones the Won dialog can link. See CR-16-GAP-PIPELINE-READS.
 */

import type { ProposalStatus } from "@/contracts/common";
import { db } from "@/platform/db";

export interface BoardProposalRef {
  id: string;
  version: number;
  status: ProposalStatus;
}

export async function listBoardProposalRefs(
  leadIds: string[],
): Promise<Map<string, BoardProposalRef[]>> {
  const out = new Map<string, BoardProposalRef[]>();
  if (leadIds.length === 0) return out;
  const rows = await db.proposal.findMany({
    where: { leadId: { in: leadIds }, status: { notIn: ["SUPERSEDED", "EXPIRED", "DECLINED"] } },
    orderBy: [{ createdAt: "desc" }, { version: "desc" }],
    select: { id: true, leadId: true, version: true, status: true },
  });
  for (const row of rows) {
    const list = out.get(row.leadId) ?? [];
    list.push({ id: row.id, version: row.version, status: row.status });
    out.set(row.leadId, list);
  }
  return out;
}
