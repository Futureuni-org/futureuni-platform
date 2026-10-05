import "server-only";

import type { ServiceLine } from "@/contracts/common";

import { LINE_SLUGS } from "@/modules/acquisition/ui/shell";
import type { LeadListRow } from "./leads-list.repo";
import type { LeadRowView } from "./leads-table";

/** Map a server lead row to the plain, date-as-string view the client table renders. */
export function toLeadRowView(row: LeadListRow, line: ServiceLine): LeadRowView {
  return {
    id: row.id,
    href: `/acquisition/${LINE_SLUGS[line]}/leads/${row.id}`,
    companyName: row.companyName,
    city: row.city,
    country: row.country,
    market: row.market,
    status: row.status,
    score: row.score,
    scoreBand: row.scoreBand,
    strongestFinding: row.strongestFinding,
    owner: row.owner,
    lastActivityAt: row.lastActivityAt.toISOString(),
    nextActionAt: row.nextActionAt === null ? null : row.nextActionAt.toISOString(),
    nextActionNote: row.nextActionNote,
    overdue: row.overdue,
    source: row.source,
    needsHumanReview: row.needsHumanReview,
    complianceReview: row.complianceReview,
    inCrossSellGroup: row.inCrossSellGroup,
  };
}
