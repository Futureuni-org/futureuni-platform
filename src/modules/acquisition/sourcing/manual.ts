import "server-only";

/**
 * Manual add (Phase 8): a team member adds one business by hand. It follows the same pipeline as a
 * search (dedupe, early suppression, signal, `NEW` lead), with the source recorded as
 * `manual:<userId>` and the new lead owned by the creator (module spec §2, §3.5).
 */

import type { Actor, ServiceLine } from "@/contracts/common";
import type { RawSignal } from "@/contracts/source-adapter";
import { assertActorCan } from "@/platform/auth";
import { db, type SearchRun } from "@/platform/db";

import { emptyCounts, processRawSignal, type PipelineContext } from "./pipeline";
import { createSearchRun, finishSearchRun } from "./sourcing.repo";

export interface ManualLeadInput {
  serviceLine: ServiceLine;
  company: {
    name: string;
    website?: string;
    phone?: string;
    email?: string;
    city?: string;
    region?: string;
    country?: string;
  };
  contact?: { name?: string; role?: string; email?: string; phone?: string };
  /** Profile signal ids the member asserts (besides the reserved manual_lead). */
  signalTypes?: string[];
  sourceUrl?: string;
}

export interface ManualLeadResult {
  searchRun: SearchRun;
}

export async function addManualLead(actor: Actor, input: ManualLeadInput): Promise<ManualLeadResult> {
  await assertActorCan(actor, "acquisition.lead.create", { serviceLine: input.serviceLine });

  const ownerId = actor.type === "USER" ? actor.userId : null;
  const sourceId = actor.type === "USER" ? `manual:${actor.userId}` : "manual";
  const now = new Date();

  const searchRun = await createSearchRun(db, {
    serviceLine: input.serviceLine,
    markets: ["NIGERIA", "INTERNATIONAL"],
    spec: { serviceLine: input.serviceLine, source: "manual" },
    trigger: "MANUAL_ADD",
    actor,
    status: "RUNNING",
    startedAt: now,
  });

  const allowed = new Set<string>(["manual_lead", ...(input.signalTypes ?? [])]);
  try {
    const { getActiveProfile } = await import("@/modules/acquisition/profiles");
    const profile = await getActiveProfile(input.serviceLine);
    for (const signal of profile.signals) allowed.add(signal.id);
  } catch {
    // No active profile in this environment: the asserted signals stand.
  }

  const counts = emptyCounts();
  const started = Date.now();
  const pctx: PipelineContext = {
    searchRunId: searchRun.id,
    serviceLine: input.serviceLine,
    requestedMarkets: ["NIGERIA", "INTERNATIONAL"],
    fallbackMarket: "NIGERIA",
    actor,
    clock: { now: () => new Date() },
    counts,
    allowedSignalTypes: allowed,
    sourceId,
    ownerId,
    log: { warn: () => undefined },
  };

  const base = {
    adapterId: "manual" as const,
    companyName: input.company.name,
    ...(input.company.website === undefined ? {} : { website: input.company.website }),
    ...(input.company.phone === undefined ? {} : { phone: input.company.phone }),
    ...(input.company.email === undefined ? {} : { email: input.company.email }),
    address: {
      ...(input.company.city === undefined ? {} : { city: input.company.city }),
      ...(input.company.region === undefined ? {} : { region: input.company.region }),
      ...(input.company.country === undefined ? {} : { country: input.company.country }),
    },
    ...(input.company.country === undefined ? {} : { country: input.company.country }),
    ...(input.contact === undefined ? {} : { contact: input.contact }),
    ...(input.sourceUrl === undefined ? {} : { sourceUrl: input.sourceUrl }),
    observedAt: now.toISOString(),
  };
  const types = ["manual_lead", ...(input.signalTypes ?? []).filter((t) => t !== "manual_lead")];
  const signals: RawSignal[] = types.map((signalType) => ({
    ...base,
    signalType,
    evidenceText:
      signalType === "manual_lead"
        ? "Added by hand by a FUTUREUNI team member."
        : `Added by hand; the team member marked this business as "${signalType}".`,
  }));

  counts.fetched += 1;
  for (const signal of signals) await processRawSignal(signal, pctx);

  const finished = await finishSearchRun(searchRun.id, {
    status: "SUCCEEDED",
    counts: { ...counts },
    perSource: [
      { adapterId: "manual", market: "NIGERIA", status: "DONE", fetched: 1, calls: 0, costMicros: 0 },
    ],
    costMicros: 0,
    durationMs: Date.now() - started,
  });

  return { searchRun: finished };
}
