import "server-only";

import { db } from "@/platform/db";
import type { DsrStatus } from "@/contracts/common";

/**
 * Interim read model for the data-requests admin screen.
 *
 * The compliance module (Phase 9) exposes `createDataSubjectRequest`, `fulfilExport` and
 * `fulfilDelete` but no list reader. Rather than edit another phase's module, this `*.repo.ts`
 * (allowed by the DB-access naming rule) reads the rows for display only. At Wave 4 integration
 * this is replaced by a `listDataSubjectRequests` service on `@/modules/acquisition/compliance`
 * (see CR-18-GAP-DSR-LIST in phases/18/REQUESTS.md).
 */

export interface DsrRow {
  id: string;
  type: "EXPORT" | "DELETE";
  status: DsrStatus;
  subjectEmail: string | null;
  subjectPhone: string | null;
  requestedBy: string;
  notes: string | null;
  createdAt: Date;
  fulfilledAt: Date | null;
  exportFileId: string | null;
}

export async function countOpenDataSubjectRequests(): Promise<number> {
  return db.dataSubjectRequest.count({ where: { status: "OPEN" } });
}

export async function listDataSubjectRequests(limit = 100): Promise<DsrRow[]> {
  const rows = await db.dataSubjectRequest.findMany({
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: Math.min(Math.max(limit, 1), 200),
    select: {
      id: true,
      type: true,
      status: true,
      subjectEmail: true,
      subjectPhone: true,
      requestedBy: true,
      notes: true,
      createdAt: true,
      fulfilledAt: true,
      exportFileId: true,
    },
  });
  return rows;
}
