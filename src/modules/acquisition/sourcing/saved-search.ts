import "server-only";

/**
 * Saved searches (Phase 8, Step 5): create/update/pause/delete/list and run-now. Every mutation
 * checks `acquisition.savedSearch.manage` for the spec's service line and is audited. The schedule
 * itself is exposed to the cron dispatcher by `getSourcingDynamicSchedules` (schedules.ts).
 */

import { randomUUID } from "node:crypto";

import type { Actor } from "@/contracts/common";
import { SearchSpecSchema, type SearchSpec } from "@/contracts/source-adapter";
import { AppError } from "@/lib/errors";
import { audit } from "@/platform/audit-log";
import { assertActorCan } from "@/platform/auth";
import { enqueueJob } from "@/platform/jobs";
import { toJsonInput, type SavedSearch } from "@/platform/db";

import {
  createSavedSearch as createSavedSearchRow,
  deleteSavedSearch as deleteSavedSearchRow,
  getSavedSearch,
  listSavedSearches as listSavedSearchesRows,
  updateSavedSearch as updateSavedSearchRow,
} from "./sourcing.repo";

const TARGET = "acquisition.savedSearch";

function assertCron(cron: string): void {
  if (cron.trim().split(/\s+/).length !== 5) {
    throw new AppError("VALIDATION_FAILED", "A schedule must be a 5-field cron expression.");
  }
}

async function loadOrThrow(id: string): Promise<SavedSearch> {
  const row = await getSavedSearch(id);
  if (row === null) throw new AppError("NOT_FOUND", "That saved search doesn't exist.");
  return row;
}

export interface CreateSavedSearchInput {
  name: string;
  spec: unknown;
  cron: string;
  timezone?: string;
  enabled?: boolean;
  ownerId?: string;
}

export async function createSavedSearch(
  actor: Actor,
  input: CreateSavedSearchInput,
): Promise<SavedSearch> {
  const spec: SearchSpec = SearchSpecSchema.parse(input.spec);
  assertCron(input.cron);
  await assertActorCan(actor, "acquisition.savedSearch.manage", { serviceLine: spec.serviceLine });
  const ownerId = input.ownerId ?? (actor.type === "USER" ? actor.userId : null);
  if (ownerId === null) {
    throw new AppError("VALIDATION_FAILED", "A saved search needs an owner.");
  }
  const row = await createSavedSearchRow({
    name: input.name,
    serviceLine: spec.serviceLine,
    spec,
    cron: input.cron,
    timezone: input.timezone ?? "Africa/Lagos",
    enabled: input.enabled ?? true,
    ownerId,
  });
  await audit.record(null, { actor, action: "acquisition.savedSearch.manage", targetType: TARGET, targetId: row.id, after: row });
  return row;
}

export interface UpdateSavedSearchPatch {
  name?: string;
  spec?: unknown;
  cron?: string;
  timezone?: string;
  enabled?: boolean;
  ownerId?: string;
}

export async function updateSavedSearch(
  actor: Actor,
  id: string,
  patch: UpdateSavedSearchPatch,
): Promise<SavedSearch> {
  const before = await loadOrThrow(id);
  await assertActorCan(actor, "acquisition.savedSearch.manage", { serviceLine: before.serviceLine });
  if (patch.cron !== undefined) assertCron(patch.cron);
  const spec = patch.spec === undefined ? null : SearchSpecSchema.parse(patch.spec);
  if (spec !== null && spec.serviceLine !== before.serviceLine) {
    throw new AppError("VALIDATION_FAILED", "A saved search can't change its service line.");
  }
  const after = await updateSavedSearchRow(id, {
    ...(patch.name === undefined ? {} : { name: patch.name }),
    ...(spec === null ? {} : { spec: toJsonInput(spec) }),
    ...(patch.cron === undefined ? {} : { cron: patch.cron }),
    ...(patch.timezone === undefined ? {} : { timezone: patch.timezone }),
    ...(patch.enabled === undefined ? {} : { enabled: patch.enabled }),
    ...(patch.ownerId === undefined ? {} : { ownerId: patch.ownerId }),
  });
  await audit.record(null, { actor, action: "acquisition.savedSearch.manage", targetType: TARGET, targetId: id, before, after });
  return after;
}

export async function pauseSavedSearch(
  actor: Actor,
  id: string,
  reason?: string,
): Promise<SavedSearch> {
  const before = await loadOrThrow(id);
  await assertActorCan(actor, "acquisition.savedSearch.manage", { serviceLine: before.serviceLine });
  const after = await updateSavedSearchRow(id, {
    enabled: false,
    pausedReason: reason ?? "paused by user",
  });
  await audit.record(null, { actor, action: "acquisition.savedSearch.manage", targetType: TARGET, targetId: id, before, after });
  return after;
}

export async function deleteSavedSearch(actor: Actor, id: string): Promise<void> {
  const before = await loadOrThrow(id);
  await assertActorCan(actor, "acquisition.savedSearch.manage", { serviceLine: before.serviceLine });
  await deleteSavedSearchRow(id);
  await audit.record(null, { actor, action: "acquisition.savedSearch.manage", targetType: TARGET, targetId: id, before });
}

export function listSavedSearches(input: {
  serviceLine?: SearchSpec["serviceLine"];
}): Promise<SavedSearch[]> {
  return listSavedSearchesRows(input.serviceLine === undefined ? {} : { serviceLine: input.serviceLine });
}

/** Enqueues a one-off run of a saved search now (a unique slot keeps each run distinct). */
export async function runSavedSearchNow(
  actor: Actor,
  id: string,
): Promise<{ jobRunId: string }> {
  const saved = await loadOrThrow(id);
  await assertActorCan(actor, "acquisition.savedSearch.manage", { serviceLine: saved.serviceLine });
  const spec = SearchSpecSchema.parse(saved.spec);
  const { jobRunId } = await enqueueJob(
    "acquisition.sourcing.run",
    { spec, savedSearchId: id, slot: new Date().toISOString(), notifyUserId: saved.ownerId, nonce: randomUUID() },
    { actor },
  );
  return { jobRunId };
}
