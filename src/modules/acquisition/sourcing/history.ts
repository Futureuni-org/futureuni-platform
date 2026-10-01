import "server-only";

/**
 * Search history and source-stats services (Phase 8, Step 5), for the Phase 15 run pages and the
 * Phase 17 analytics. Reads check `acquisition.search.read` for the line; cancelling checks
 * `acquisition.search.run`.
 */

import type { Actor, Page, ServiceLine } from "@/contracts/common";
import { AppError } from "@/lib/errors";
import { assertActorCan } from "@/platform/auth";
import type { SearchRun, Signal } from "@/platform/db";

import {
  getSearchRun as getSearchRunRow,
  getSearchRunWithLeads,
  listSearchRuns as listSearchRunsRows,
  markSearchRunCancelled,
  getSourceStats as getSourceStatsRows,
  type SourceStatRow,
} from "./sourcing.repo";

export function listSearchRuns(
  actor: Actor,
  input: { serviceLine: ServiceLine; from?: Date; to?: Date; cursor?: string; limit?: number },
): Promise<Page<SearchRun>> {
  return assertActorCan(actor, "acquisition.search.read", { serviceLine: input.serviceLine }).then(
    () => listSearchRunsRows(input),
  );
}

export interface SearchRunDetail {
  run: SearchRun;
  signals: Signal[];
  leadIds: string[];
}

export async function getSearchRun(actor: Actor, id: string): Promise<SearchRunDetail> {
  const run = await getSearchRunWithLeads(id);
  if (run === null) throw new AppError("NOT_FOUND", "That search run doesn't exist.");
  await assertActorCan(actor, "acquisition.search.read", { serviceLine: run.serviceLine });
  const leadIds = [
    ...new Set(run.signals.map((s) => s.leadId).filter((id): id is string => id !== null)),
  ];
  return { run, signals: run.signals, leadIds };
}

export async function cancelSearchRun(actor: Actor, id: string): Promise<SearchRun> {
  const run = await getSearchRunRow(id);
  if (run === null) throw new AppError("NOT_FOUND", "That search run doesn't exist.");
  await assertActorCan(actor, "acquisition.search.run", { serviceLine: run.serviceLine });
  if (run.status !== "RUNNING" && run.status !== "QUEUED") {
    throw new AppError("CONFLICT", "Only a running or queued search can be cancelled.");
  }
  return markSearchRunCancelled(id);
}

export function getSourceStats(
  actor: Actor,
  input: { serviceLine: ServiceLine; from?: Date; to?: Date },
): Promise<SourceStatRow[]> {
  return assertActorCan(actor, "acquisition.search.read", { serviceLine: input.serviceLine }).then(
    () => getSourceStatsRows(input),
  );
}
