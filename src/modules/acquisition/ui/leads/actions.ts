"use server";

/**
 * Server actions for the leads list: permission-aware bulk operations and per-user saved views.
 * Each follows the saas-api handler shape: authenticate, parse with Zod, authorise, delegate to a
 * service, return a typed `ActionResult`. Bulk operations apply each lead on its own and report
 * per-lead failures rather than throwing the whole batch away, so a member hitting a lead they
 * don't own simply sees that row fail.
 */

import { z } from "zod";

import { IdSchema, ServiceLineSchema } from "@/contracts/common";
import type { PermissionAction } from "@/contracts/permissions";
import { AppError } from "@/lib/errors";
import { ok, type ActionResult } from "@/lib/result";
import { actorOf, canFromUser, requireUser, type CurrentUser } from "@/platform/auth";
import { enqueueJob } from "@/platform/jobs";
import { assignLead, disqualifyLead } from "@/modules/acquisition/scoring";
import { snoozeLead } from "@/modules/acquisition/outreach";
import { addSuppression } from "@/modules/acquisition/compliance";

import { failed } from "./action-result";
import { canReauditIn, canRescoreIn } from "./lead-actions";
import { getLeadScopes, leadResource, type LeadScope } from "./lead-detail.repo";
import { LEAD_FILTER_KEYS, parseLeadFilters } from "./lead-filters";
import { getLeadSuppressionTarget, listLeads, recordReauditRequested } from "./leads-list.repo";
import { createSavedView, deleteSavedView } from "./saved-views.repo";
import { toLeadRowView } from "./leads-view";
import type { LeadRowView } from "./leads-table";

export interface BulkResult {
  succeeded: number;
  failed: { leadId: string; message: string }[];
}

function fail(issues: unknown): AppError {
  return new AppError("VALIDATION_FAILED", "Please check the form and try again.", {
    details: { issues },
  });
}

// De-duplicated, so a repeated id can't run the same operation twice or be counted twice.
const LeadIdsSchema = z
  .array(IdSchema)
  .min(1)
  .max(200)
  .transform((ids) => [...new Set(ids)]);

/** Applies `fn` to each lead id, collecting per-lead failures with their safe messages. */
async function runBulk(
  leadIds: string[],
  fn: (leadId: string) => Promise<void>,
): Promise<BulkResult> {
  const failures: { leadId: string; message: string }[] = [];
  let succeeded = 0;
  for (const leadId of leadIds) {
    try {
      await fn(leadId);
      succeeded += 1;
    } catch (error) {
      failures.push({
        leadId,
        message: error instanceof AppError ? error.message : "Something went wrong.",
      });
    }
  }
  return { succeeded, failed: failures };
}

/**
 * Runs `fn` for each lead the user may act on, after checking the lead exists, the permission
 * matrix allows `action` on it, and (when given) the lead's status allows the operation. Used where
 * no service authorises the work itself: queued jobs and the suppression list.
 */
async function runAuthorisedBulk(
  user: CurrentUser,
  leadIds: string[],
  action: PermissionAction,
  fn: (leadId: string, scope: LeadScope) => Promise<void>,
  eligible?: { test: (scope: LeadScope) => boolean; message: string },
): Promise<BulkResult> {
  const scopes = await getLeadScopes(leadIds);
  return runBulk(leadIds, async (leadId) => {
    const scope = scopes.get(leadId);
    if (scope === undefined) throw new AppError("NOT_FOUND", "This lead no longer exists.");
    if (!canFromUser(user, action, leadResource(scope))) {
      throw new AppError("FORBIDDEN", "You don't have permission to do this for this lead.");
    }
    if (eligible !== undefined && !eligible.test(scope)) {
      throw new AppError("CONFLICT", eligible.message);
    }
    await fn(leadId, scope);
  });
}

export async function bulkAssignAction(
  leadIds: string[],
  ownerId: string,
): Promise<ActionResult<BulkResult>> {
  try {
    const actor = actorOf(await requireUser());
    const parsed = z
      .object({ leadIds: LeadIdsSchema, ownerId: IdSchema })
      .safeParse({ leadIds, ownerId });
    if (!parsed.success) return failed(fail(parsed.error.issues));
    return ok(
      await runBulk(parsed.data.leadIds, (id) => assignLead(actor, id, parsed.data.ownerId)),
    );
  } catch (error) {
    return failed(error);
  }
}

export async function bulkSnoozeAction(
  leadIds: string[],
  until: string,
): Promise<ActionResult<BulkResult>> {
  try {
    const actor = actorOf(await requireUser());
    const parsed = z
      .object({ leadIds: LeadIdsSchema, until: z.iso.datetime() })
      .safeParse({ leadIds, until });
    if (!parsed.success) return failed(fail(parsed.error.issues));
    const untilDate = new Date(parsed.data.until);
    return ok(await runBulk(parsed.data.leadIds, (id) => snoozeLead(actor, id, untilDate)));
  } catch (error) {
    return failed(error);
  }
}

/**
 * Queues a re-score for each lead. Scoring a lead reads its findings and may call the AI reviewer,
 * so up to 200 of them can't run inside one request; each becomes a `acquisition.scoring.lead` job
 * that runs as the person who asked. `succeeded` counts the leads queued.
 */
export async function bulkRescoreAction(leadIds: string[]): Promise<ActionResult<BulkResult>> {
  try {
    const user = await requireUser();
    const actor = actorOf(user);
    const parsed = z.object({ leadIds: LeadIdsSchema }).safeParse({ leadIds });
    if (!parsed.success) return failed(fail(parsed.error.issues));
    return ok(
      await runAuthorisedBulk(
        user,
        parsed.data.leadIds,
        "acquisition.lead.rescore",
        async (leadId) => {
          await enqueueJob("acquisition.scoring.lead", { leadId }, { actor });
        },
        {
          test: (scope) => canRescoreIn(scope.status),
          message: "This lead can't be re-scored in its current status.",
        },
      ),
    );
  } catch (error) {
    return failed(error);
  }
}

/** Queues a re-audit for each lead (see `bulkRescoreAction` for why it is queued). */
export async function bulkReauditAction(leadIds: string[]): Promise<ActionResult<BulkResult>> {
  try {
    const user = await requireUser();
    const actor = actorOf(user);
    const parsed = z.object({ leadIds: LeadIdsSchema }).safeParse({ leadIds });
    if (!parsed.success) return failed(fail(parsed.error.issues));
    // The job's own key is one per lead for all time, so a second audit would be dropped as a
    // duplicate of the first. A key per lead per minute allows a re-audit and still absorbs a
    // double click.
    const minute = new Date().toISOString().slice(0, 16);
    return ok(
      await runAuthorisedBulk(
        user,
        parsed.data.leadIds,
        "acquisition.lead.reaudit",
        async (leadId) => {
          await recordReauditRequested(actor, leadId);
          await enqueueJob(
            "acquisition.audits.lead",
            { leadId, force: true },
            { actor, idempotencyKey: `acquisition.audits.lead:${leadId}:reaudit:${minute}` },
          );
        },
        {
          test: (scope) => canReauditIn(scope.status),
          message: "This lead can't be re-audited in its current status.",
        },
      ),
    );
  } catch (error) {
    return failed(error);
  }
}

export async function bulkDisqualifyAction(
  leadIds: string[],
  reason: string,
): Promise<ActionResult<BulkResult>> {
  try {
    const actor = actorOf(await requireUser());
    const parsed = z
      .object({ leadIds: LeadIdsSchema, reason: z.string().trim().min(1).max(200) })
      .safeParse({ leadIds, reason });
    if (!parsed.success) return failed(fail(parsed.error.issues));
    return ok(
      await runBulk(parsed.data.leadIds, (id) => disqualifyLead(actor, id, parsed.data.reason)),
    );
  } catch (error) {
    return failed(error);
  }
}

/**
 * Suppresses each lead's primary-contact email, or its company domain when there is no email.
 *
 * The phase prompt makes this an admin action, but `acquisition.suppression.add` is open to every
 * role (anyone may honour an opt-out) and the matrix has no action for "suppress a lead". Until it
 * does, the gate is `acquisition.suppression.remove`: only the people who can undo a suppression
 * may add one from a lead, which is the admins. The lead must also be one the person can read, so
 * an id from another line reveals and changes nothing. See CR-16-LEAD-SUPPRESS in REQUESTS.md.
 */
export async function bulkSuppressAction(
  leadIds: string[],
  reason: string,
): Promise<ActionResult<BulkResult>> {
  try {
    const user = await requireUser();
    const actor = actorOf(user);
    const parsed = z
      .object({ leadIds: LeadIdsSchema, reason: z.string().trim().min(1).max(200) })
      .safeParse({ leadIds, reason });
    if (!parsed.success) return failed(fail(parsed.error.issues));
    if (!canFromUser(user, "acquisition.suppression.remove")) {
      throw new AppError("FORBIDDEN", "Only an admin can add a lead to the suppression list.");
    }
    return ok(
      await runBulk(parsed.data.leadIds, async (leadId) => {
        const target = await getLeadSuppressionTarget(leadId);
        if (target === null) throw new AppError("NOT_FOUND", "This lead no longer exists.");
        if (!canFromUser(user, "acquisition.lead.read", leadResource(target))) {
          throw new AppError("FORBIDDEN", "You don't have permission to do this for this lead.");
        }
        const value = target.email ?? target.domain;
        if (value === null) {
          throw new AppError(
            "VALIDATION_FAILED",
            "This lead has no contact email or domain to suppress.",
          );
        }
        await addSuppression(actor, {
          type: target.email !== null ? "EMAIL" : "DOMAIN",
          value,
          reason: "MANUAL",
          source: "MANUAL",
          note: parsed.data.reason,
        });
      }),
    );
  } catch (error) {
    return failed(error);
  }
}

// ---- Saved views ---------------------------------------------------------------------------

// A saved view holds the leads list's own URL params and nothing else, so a stored view can never
// carry an arbitrary key into a link.
const ViewQuerySchema = z.partialRecord(z.enum(LEAD_FILTER_KEYS), z.string().max(200));
const QuerySchema = z.record(z.string().max(64), z.string().max(512));

export async function saveLeadViewAction(
  serviceLine: string,
  name: string,
  query: Record<string, string>,
): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requireUser();
    const parsed = z
      .object({
        serviceLine: ServiceLineSchema,
        name: z.string().trim().min(1).max(60),
        query: ViewQuerySchema,
      })
      .safeParse({ serviceLine, name, query });
    if (!parsed.success) return failed(fail(parsed.error.issues));
    if (!canFromUser(user, "acquisition.lead.read", { serviceLine: parsed.data.serviceLine })) {
      throw new AppError("FORBIDDEN", "You can only save views for the service lines you work on.");
    }
    const stored: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed.data.query)) {
      if (value !== "") stored[key] = value;
    }
    const view = await createSavedView(user.id, parsed.data.serviceLine, parsed.data.name, stored);
    return ok({ id: view.id });
  } catch (error) {
    return failed(error);
  }
}

export async function deleteLeadViewAction(id: string): Promise<ActionResult<{ ok: true }>> {
  try {
    const user = await requireUser();
    const parsed = z.object({ id: IdSchema }).safeParse({ id });
    if (!parsed.success) return failed(fail(parsed.error.issues));
    await deleteSavedView(user.id, parsed.data.id);
    return ok({ ok: true });
  } catch (error) {
    return failed(error);
  }
}

// ---- Pagination ----------------------------------------------------------------------------

export async function loadMoreLeadsAction(
  serviceLine: string,
  query: Record<string, string>,
  cursor: string,
): Promise<ActionResult<{ items: LeadRowView[]; nextCursor: string | null }>> {
  try {
    const user = await requireUser();
    const parsed = z
      .object({
        serviceLine: ServiceLineSchema,
        query: QuerySchema,
        cursor: z.string().min(1).max(512),
      })
      .safeParse({ serviceLine, query, cursor });
    if (!parsed.success) return failed(fail(parsed.error.issues));
    if (!canFromUser(user, "acquisition.lead.read", { serviceLine: parsed.data.serviceLine })) {
      throw new AppError("FORBIDDEN", "You can only view leads for the service lines you work on.");
    }
    const page = await listLeads({
      serviceLine: parsed.data.serviceLine,
      filter: parseLeadFilters(parsed.data.query, user.timezone),
      cursor: parsed.data.cursor,
    });
    return ok({
      items: page.items.map((row) => toLeadRowView(row, parsed.data.serviceLine)),
      nextCursor: page.nextCursor,
    });
  } catch (error) {
    return failed(error);
  }
}
