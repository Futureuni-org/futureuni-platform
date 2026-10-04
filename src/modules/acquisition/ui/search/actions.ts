"use server";

/**
 * Server actions for the Search screen: estimate a run's cost, start a run, poll its progress,
 * retry a failed source, cancel, manage saved searches and add a lead by hand. Each one
 * authenticates, resolves the line, authorises on the server (the UI gate is never the control),
 * then calls the sourcing services. Ad-hoc runs are enqueued directly on the jobs platform because
 * sourcing exposes no ad-hoc wrapper (see phases/15/REQUESTS.md).
 */

import { randomUUID } from "node:crypto";

import { z } from "zod";

import { AppError } from "@/lib/errors";
import { ok, err, type ActionResult } from "@/lib/result";
import { actorOf, assertCan, requireUser } from "@/platform/auth";
import { enqueueJob } from "@/platform/jobs";
import { getSetting } from "@/platform/settings";
import {
  SOURCING_SETTING_KEYS,
  addManualLead,
  cancelSearchRun,
  createSavedSearch,
  deleteSavedSearch,
  estimateSearchCost,
  getSearchRun,
  listSavedSearches,
  listSearchRuns,
  pauseSavedSearch,
  runSavedSearchNow,
  updateSavedSearch,
  type SearchCostEstimate,
} from "@/modules/acquisition/sourcing";
import {
  SearchSpecSchema,
  SearchRunCountsSchema,
  SearchRunSourceResultSchema,
} from "@/contracts/source-adapter";
import type { ServiceLine } from "@/contracts/common";
import { resolveLine } from "@/modules/acquisition/ui/shell";

import { getRunLeadCards } from "@/modules/acquisition/ui/search/search-leads.repo";
import { isFinishedStatus, type RunProgress } from "@/modules/acquisition/ui/search/view";

const DEFAULT_RUN_COST_CAP_MICROS = 5_000_000;
const PROGRESS_LEAD_CAP = 60;

function resolveLineOrThrow(slug: string): { line: ServiceLine } {
  const ctx = resolveLine(slug);
  if (ctx === null) throw new AppError("NOT_FOUND", "Unknown service line.");
  return { line: ctx.line };
}

function mapCounts(raw: unknown): RunProgress["counts"] {
  const parsed = SearchRunCountsSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

function mapPerSource(raw: unknown): RunProgress["perSource"] {
  const parsed = z.array(SearchRunSourceResultSchema).safeParse(raw);
  return parsed.success ? parsed.data : [];
}

// ---------------------------------------------------------------------------
// Cost estimate
// ---------------------------------------------------------------------------

export async function estimateCostAction(
  slug: string,
  spec: unknown,
): Promise<ActionResult<{ estimate: SearchCostEstimate; capMicros: number }>> {
  try {
    const user = await requireUser();
    const { line } = resolveLineOrThrow(slug);
    assertCan(user, "acquisition.search.run", { serviceLine: line });

    const parsed = SearchSpecSchema.safeParse(spec);
    if (!parsed.success) {
      return err(new AppError("VALIDATION_FAILED", "The search isn't complete yet."));
    }

    const estimate = await estimateSearchCost({ ...parsed.data, serviceLine: line });
    let capMicros = DEFAULT_RUN_COST_CAP_MICROS;
    try {
      const configured = await getSetting<number>(SOURCING_SETTING_KEYS.maxCostMicrosPerRun);
      if (typeof configured === "number") capMicros = configured;
    } catch {
      // Setting not registered yet (pre-Phase-19): keep the default cap.
    }
    return ok({ estimate, capMicros });
  } catch (error) {
    return err(error);
  }
}

// ---------------------------------------------------------------------------
// Run now / retry / cancel
// ---------------------------------------------------------------------------

export async function startSearchAction(
  slug: string,
  spec: unknown,
): Promise<ActionResult<{ jobRunId: string }>> {
  try {
    const user = await requireUser();
    const { line } = resolveLineOrThrow(slug);
    assertCan(user, "acquisition.search.run", { serviceLine: line });

    const parsed = SearchSpecSchema.safeParse(spec);
    if (!parsed.success) {
      return err(new AppError("VALIDATION_FAILED", "Check the search: a market needs a location."));
    }

    const { jobRunId } = await enqueueJob(
      "acquisition.sourcing.run",
      { spec: { ...parsed.data, serviceLine: line }, nonce: randomUUID() },
      { actor: actorOf(user) },
    );
    return ok({ jobRunId });
  } catch (error) {
    return err(error);
  }
}

export async function getRunProgressAction(
  slug: string,
  input: { runId?: string; jobRunId?: string },
): Promise<ActionResult<RunProgress>> {
  try {
    const user = await requireUser();
    const { line } = resolveLineOrThrow(slug);
    assertCan(user, "acquisition.search.read", { serviceLine: line });
    const actor = actorOf(user);

    let runId = input.runId ?? null;
    if (runId === null && input.jobRunId !== undefined) {
      const page = await listSearchRuns(actor, { serviceLine: line, limit: 25 });
      runId = page.items.find((r) => r.jobRunId === input.jobRunId)?.id ?? null;
    }

    const pending: RunProgress = {
      runId,
      status: "QUEUED",
      finished: false,
      counts: null,
      perSource: [],
      leads: [],
      error: null,
      skipReason: null,
    };
    if (runId === null) return ok(pending);

    const detail = await getSearchRun(actor, runId).catch(() => null);
    if (detail === null) return ok(pending);

    const run = detail.run;
    const leads = await getRunLeadCards(detail.leadIds.slice(0, PROGRESS_LEAD_CAP));
    return ok({
      runId: run.id,
      status: run.status,
      finished: isFinishedStatus(run.status),
      counts: mapCounts(run.counts),
      perSource: mapPerSource(run.perSource),
      leads,
      error: run.error ?? null,
      skipReason: run.skipReason ?? null,
    });
  } catch (error) {
    return err(error);
  }
}

export async function retrySourceAction(
  slug: string,
  runId: string,
  adapterId: string,
): Promise<ActionResult<{ jobRunId: string }>> {
  try {
    const user = await requireUser();
    const { line } = resolveLineOrThrow(slug);
    assertCan(user, "acquisition.search.run", { serviceLine: line });
    const actor = actorOf(user);

    const detail = await getSearchRun(actor, runId);
    const parsed = SearchSpecSchema.safeParse(detail.run.spec);
    if (!parsed.success) {
      return err(new AppError("VALIDATION_FAILED", "Couldn't rebuild the search to retry."));
    }
    const { jobRunId } = await enqueueJob(
      "acquisition.sourcing.run",
      { spec: { ...parsed.data, serviceLine: line, sources: [adapterId] }, nonce: randomUUID() },
      { actor },
    );
    return ok({ jobRunId });
  } catch (error) {
    return err(error);
  }
}

export async function cancelRunAction(slug: string, runId: string): Promise<ActionResult<null>> {
  try {
    const user = await requireUser();
    const { line } = resolveLineOrThrow(slug);
    assertCan(user, "acquisition.search.run", { serviceLine: line });
    await cancelSearchRun(actorOf(user), runId);
    return ok(null);
  } catch (error) {
    return err(error);
  }
}

// ---------------------------------------------------------------------------
// Saved searches
// ---------------------------------------------------------------------------

const SavedSearchFormSchema = z.object({
  name: z.string().min(2).max(120),
  cron: z.string().min(1).max(120),
  timezone: z.string().min(1).max(60).default("Africa/Lagos"),
  enabled: z.boolean().default(true),
  ownerId: z.string().optional(),
});

export async function createSavedSearchAction(
  slug: string,
  spec: unknown,
  form: unknown,
): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requireUser();
    const { line } = resolveLineOrThrow(slug);
    assertCan(user, "acquisition.savedSearch.manage", { serviceLine: line });

    const parsedSpec = SearchSpecSchema.safeParse(spec);
    if (!parsedSpec.success) {
      return err(new AppError("VALIDATION_FAILED", "The search isn't complete yet."));
    }
    const parsedForm = SavedSearchFormSchema.safeParse(form);
    if (!parsedForm.success) {
      return err(new AppError("VALIDATION_FAILED", "Check the name and schedule."));
    }

    const saved = await createSavedSearch(actorOf(user), {
      name: parsedForm.data.name,
      spec: { ...parsedSpec.data, serviceLine: line },
      cron: parsedForm.data.cron,
      timezone: parsedForm.data.timezone,
      enabled: parsedForm.data.enabled,
      ...(parsedForm.data.ownerId === undefined ? {} : { ownerId: parsedForm.data.ownerId }),
    });
    return ok({ id: saved.id });
  } catch (error) {
    return err(error);
  }
}

export async function updateSavedSearchAction(
  slug: string,
  id: string,
  spec: unknown,
  form: unknown,
): Promise<ActionResult<null>> {
  try {
    const user = await requireUser();
    const { line } = resolveLineOrThrow(slug);
    assertCan(user, "acquisition.savedSearch.manage", { serviceLine: line });

    const parsedForm = SavedSearchFormSchema.safeParse(form);
    if (!parsedForm.success) {
      return err(new AppError("VALIDATION_FAILED", "Check the name and schedule."));
    }
    const parsedSpec = SearchSpecSchema.safeParse(spec);

    await updateSavedSearch(actorOf(user), id, {
      name: parsedForm.data.name,
      cron: parsedForm.data.cron,
      timezone: parsedForm.data.timezone,
      enabled: parsedForm.data.enabled,
      ...(parsedForm.data.ownerId === undefined ? {} : { ownerId: parsedForm.data.ownerId }),
      ...(parsedSpec.success ? { spec: { ...parsedSpec.data, serviceLine: line } } : {}),
    });
    return ok(null);
  } catch (error) {
    return err(error);
  }
}

export async function setSavedSearchEnabledAction(
  slug: string,
  id: string,
  enabled: boolean,
): Promise<ActionResult<null>> {
  try {
    const user = await requireUser();
    const { line } = resolveLineOrThrow(slug);
    assertCan(user, "acquisition.savedSearch.manage", { serviceLine: line });
    if (enabled) {
      await updateSavedSearch(actorOf(user), id, { enabled: true });
    } else {
      await pauseSavedSearch(actorOf(user), id);
    }
    return ok(null);
  } catch (error) {
    return err(error);
  }
}

export async function deleteSavedSearchAction(slug: string, id: string): Promise<ActionResult<null>> {
  try {
    const user = await requireUser();
    const { line } = resolveLineOrThrow(slug);
    assertCan(user, "acquisition.savedSearch.manage", { serviceLine: line });
    await deleteSavedSearch(actorOf(user), id);
    return ok(null);
  } catch (error) {
    return err(error);
  }
}

export async function runSavedSearchNowAction(
  slug: string,
  id: string,
): Promise<ActionResult<{ jobRunId: string }>> {
  try {
    const user = await requireUser();
    const { line } = resolveLineOrThrow(slug);
    assertCan(user, "acquisition.savedSearch.manage", { serviceLine: line });
    const result = await runSavedSearchNow(actorOf(user), id);
    return ok(result);
  } catch (error) {
    return err(error);
  }
}

export async function duplicateSavedSearchAction(
  slug: string,
  id: string,
): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requireUser();
    const { line } = resolveLineOrThrow(slug);
    assertCan(user, "acquisition.savedSearch.manage", { serviceLine: line });
    const actor = actorOf(user);

    const existing = (await listSavedSearches({ serviceLine: line })).find((s) => s.id === id);
    if (existing === undefined) {
      return err(new AppError("NOT_FOUND", "That saved search no longer exists."));
    }
    const copy = await createSavedSearch(actor, {
      name: `${existing.name} (copy)`,
      spec: existing.spec,
      cron: existing.cron,
      timezone: existing.timezone,
      enabled: false,
      ownerId: existing.ownerId,
    });
    return ok({ id: copy.id });
  } catch (error) {
    return err(error);
  }
}

// ---------------------------------------------------------------------------
// Manual add
// ---------------------------------------------------------------------------

const ManualAddSchema = z.object({
  company: z.object({
    name: z.string().min(2).max(160),
    website: z.string().max(300).optional(),
    phone: z.string().max(40).optional(),
    email: z.string().max(160).optional(),
    city: z.string().max(80).optional(),
    region: z.string().max(80).optional(),
    country: z.string().max(80).optional(),
  }),
  contact: z
    .object({
      name: z.string().max(120).optional(),
      role: z.string().max(120).optional(),
      email: z.string().max(160).optional(),
      phone: z.string().max(40).optional(),
    })
    .optional(),
  sourceUrl: z.string().max(300).optional(),
});

export async function addManualLeadAction(
  slug: string,
  input: unknown,
): Promise<ActionResult<{ runId: string; leadId: string | null }>> {
  try {
    const user = await requireUser();
    const { line } = resolveLineOrThrow(slug);
    assertCan(user, "acquisition.lead.create", { serviceLine: line });

    const parsed = ManualAddSchema.safeParse(input);
    if (!parsed.success) {
      return err(new AppError("VALIDATION_FAILED", "A company name and one way to reach them are required."));
    }
    const actor = actorOf(user);
    const c = parsed.data.company;
    const company = {
      name: c.name,
      ...(c.website === undefined ? {} : { website: c.website }),
      ...(c.phone === undefined ? {} : { phone: c.phone }),
      ...(c.email === undefined ? {} : { email: c.email }),
      ...(c.city === undefined ? {} : { city: c.city }),
      ...(c.region === undefined ? {} : { region: c.region }),
      ...(c.country === undefined ? {} : { country: c.country }),
    };
    const ct = parsed.data.contact;
    const contact =
      ct === undefined
        ? undefined
        : {
            ...(ct.name === undefined ? {} : { name: ct.name }),
            ...(ct.role === undefined ? {} : { role: ct.role }),
            ...(ct.email === undefined ? {} : { email: ct.email }),
            ...(ct.phone === undefined ? {} : { phone: ct.phone }),
          };
    const result = await addManualLead(actor, {
      serviceLine: line,
      company,
      ...(contact === undefined ? {} : { contact }),
      ...(parsed.data.sourceUrl === undefined ? {} : { sourceUrl: parsed.data.sourceUrl }),
    });
    const detail = await getSearchRun(actor, result.searchRun.id).catch(() => null);
    return ok({ runId: result.searchRun.id, leadId: detail?.leadIds[0] ?? null });
  } catch (error) {
    return err(error);
  }
}
