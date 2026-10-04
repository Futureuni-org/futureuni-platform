import type { Market, ServiceLine } from "@/contracts/common";
import type { SearchRunCounts, SearchRunSourceResult } from "@/contracts/source-adapter";

/**
 * Serialisable view shapes shared between the Search server actions and the client panels.
 * (Prisma `SearchRun` rows have `Json`-typed `counts`/`perSource`/`spec`; actions map them to these
 * narrow DTOs so client components never touch Prisma types.)
 */

export interface RunLeadCard {
  id: string;
  companyName: string;
  country: string | null;
  market: Market;
  score: number | null;
  signalType: string | null;
}

/** Live progress of one search run, polled by the run panel. */
export interface RunProgress {
  runId: string | null;
  status: "QUEUED" | "RUNNING" | "SUCCEEDED" | "PARTIAL" | "FAILED" | "CANCELLED" | "SKIPPED";
  finished: boolean;
  counts: SearchRunCounts | null;
  perSource: SearchRunSourceResult[];
  leads: RunLeadCard[];
  error: string | null;
  skipReason: string | null;
}

/** A row in the run-history table and the run page header. */
export interface RunSummaryDTO {
  id: string;
  serviceLine: ServiceLine;
  status: RunProgress["status"];
  trigger: string;
  markets: Market[];
  locations: string[];
  keywords: string[];
  sources: string[];
  counts: SearchRunCounts | null;
  costMicros: number;
  estimatedCostMicros: number | null;
  skipReason: string | null;
  error: string | null;
  actorId: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  jobRunId: string | null;
}

export function isFinishedStatus(status: RunProgress["status"]): boolean {
  return status !== "QUEUED" && status !== "RUNNING";
}

/** Prettify a raw signal type id ("no_website") into a short label ("No website"). */
export function signalLabel(signalType: string | null): string | null {
  if (signalType === null) return null;
  const words = signalType.replace(/[_-]+/g, " ").trim();
  return words.length === 0 ? null : words.charAt(0).toUpperCase() + words.slice(1);
}
