import "server-only";

/**
 * Write services (draft, publish, rollback). Every mutation:
 *  - checks permission via `assertActorCan` (Phase 3);
 *  - runs `validateProfile` and refuses on errors;
 *  - writes an audit entry via `audit.record` inside the transaction (INV-20);
 *  - emits `profile.published` via `publishAfterCommit` on a successful publish/rollback.
 *
 * The exact SEAM-PROFILE signatures are read-only helpers (`getActiveProfile`,
 * `listActiveProfiles`) in `read.repo.ts`.
 */

import type { Actor, ServiceLine } from "@/contracts/common";
import type {
  ProfileValidationIssue,
  ServiceLineProfile,
} from "@/contracts/service-line-profile";
import { ServiceLineProfileSchema } from "@/contracts/service-line-profile";
import { assertActorCan } from "@/platform/auth";
import { audit } from "@/platform/audit-log";
import { publishAfterCommit } from "@/platform/events";
import { toJsonInput, withTransaction, type Tx } from "@/platform/db";
import { AppError } from "@/lib/errors";

import { hasErrors, validateProfile } from "./validate";

interface WriteResult {
  version: number;
  id: string;
}

/**
 * Upserts the single DRAFT row for the given line (partial unique index enforces at most
 * one draft). `actor` must have `acquisition.profile.edit`.
 *
 * If a draft already exists, its version number is kept and the profile JSON is replaced;
 * otherwise a new draft is created with `version = maxVersion + 1`.
 */
export async function saveDraft(
  actor: Actor,
  line: ServiceLine,
  profile: ServiceLineProfile,
): Promise<WriteResult> {
  await assertActorCan(actor, "acquisition.profile.edit", { serviceLine: line });

  const parsed = ServiceLineProfileSchema.safeParse(profile);
  if (!parsed.success) {
    throw new AppError("VALIDATION_FAILED", "Profile draft failed schema validation", {
      details: { issues: parsed.error.issues },
    });
  }
  const validated = parsed.data;
  if (validated.id !== line) {
    throw new AppError("VALIDATION_FAILED", "Profile.id must match the target line", {
      details: { expected: line, got: validated.id },
    });
  }

  return withTransaction(async (tx: Tx) => {
    const existingDraft = await tx.serviceLineProfileVersion.findFirst({
      where: { serviceLine: line, status: "DRAFT" },
      select: { id: true, version: true },
    });

    if (existingDraft !== null) {
      const updated = await tx.serviceLineProfileVersion.update({
        where: { id: existingDraft.id },
        data: { profile: toJsonInput(validated) },
        select: { id: true, version: true },
      });
      await audit.record(tx, {
        actor,
        action: "acquisition.profile.edit",
        targetType: "ServiceLineProfileVersion",
        targetId: updated.id,
        after: { serviceLine: line, version: updated.version, status: "DRAFT" },
      });
      return { id: updated.id, version: updated.version };
    }

    const maxRow = await tx.serviceLineProfileVersion.aggregate({
      _max: { version: true },
      where: { serviceLine: line },
    });
    const nextVersion = (maxRow._max.version ?? 0) + 1;
    const userIdForCreated = actor.type === "USER" ? actor.userId : await systemActorUserId(tx);

    const created = await tx.serviceLineProfileVersion.create({
      data: {
        serviceLine: line,
        version: nextVersion,
        status: "DRAFT",
        isActive: false,
        profile: toJsonInput(validated),
        createdById: userIdForCreated,
      },
      select: { id: true, version: true },
    });
    await audit.record(tx, {
      actor,
      action: "acquisition.profile.edit",
      targetType: "ServiceLineProfileVersion",
      targetId: created.id,
      after: { serviceLine: line, version: created.version, status: "DRAFT" },
    });
    return { id: created.id, version: created.version };
  });
}

/**
 * Publishes the current DRAFT (or a specific version, if `fromVersion` is given). Runs
 * validation, deactivates the current active version, activates the target, audits and
 * emits `profile.published`. Actor must have `acquisition.profile.publish`.
 */
export async function publishProfile(
  actor: Actor,
  line: ServiceLine,
  note: string,
  opts: { fromVersion?: number } = {},
): Promise<{ version: number; previousVersion: number | null; warnings: ProfileValidationIssue[] }> {
  await assertActorCan(actor, "acquisition.profile.publish", { serviceLine: line });
  if (note.trim().length === 0) {
    throw new AppError("VALIDATION_FAILED", "Publish requires a non-empty note.");
  }

  return withTransaction(async (tx) => {
    // Pick the target: explicit version, or the DRAFT.
    const target =
      opts.fromVersion !== undefined
        ? await tx.serviceLineProfileVersion.findFirst({
            where: { serviceLine: line, version: opts.fromVersion },
          })
        : await tx.serviceLineProfileVersion.findFirst({
            where: { serviceLine: line, status: "DRAFT" },
          });
    if (target === null) {
      throw new AppError(
        "NOT_FOUND",
        opts.fromVersion === undefined
          ? `No draft to publish for ${line}`
          : `Version ${String(opts.fromVersion)} not found for ${line}`,
      );
    }

    const issues = validateProfile(target.profile);
    if (hasErrors(issues)) {
      throw new AppError("VALIDATION_FAILED", "Profile validation failed", {
        details: {
          issues: issues.filter((i) => i.severity === "error"),
        },
      });
    }
    const warnings = issues.filter((i) => i.severity === "warning");

    // Deactivate the current active version (there can be at most one — partial unique idx).
    const previouslyActive = await tx.serviceLineProfileVersion.findFirst({
      where: { serviceLine: line, isActive: true },
      select: { id: true, version: true },
    });
    if (previouslyActive !== null && previouslyActive.id !== target.id) {
      await tx.serviceLineProfileVersion.update({
        where: { id: previouslyActive.id },
        data: { isActive: false, status: "ARCHIVED" },
      });
    }

    const publishedById = actor.type === "USER" ? actor.userId : await systemActorUserId(tx);
    const nowIso = new Date();
    const updated = await tx.serviceLineProfileVersion.update({
      where: { id: target.id },
      data: {
        status: "PUBLISHED",
        isActive: true,
        note,
        publishedById,
        publishedAt: nowIso,
      },
      select: { id: true, version: true },
    });

    await audit.record(tx, {
      actor,
      action: "acquisition.profile.publish",
      targetType: "ServiceLineProfileVersion",
      targetId: updated.id,
      before: previouslyActive === null ? undefined : { version: previouslyActive.version },
      after: { serviceLine: line, version: updated.version, note },
    });

    await publishAfterCommit(tx, {
      name: "profile.published",
      actor,
      payload: {
        serviceLine: line,
        version: updated.version,
        previousVersion: previouslyActive?.version ?? null,
      },
    });

    return {
      version: updated.version,
      previousVersion: previouslyActive?.version ?? null,
      warnings,
    };
  });
}

/**
 * Reactivates an older `PUBLISHED` or `ARCHIVED` version as the new active. Emits
 * `profile.published` (rollback IS a publish of an older version per contract rule 4).
 */
export async function rollbackProfile(
  actor: Actor,
  line: ServiceLine,
  version: number,
  note: string,
): Promise<{ version: number; previousVersion: number | null }> {
  await assertActorCan(actor, "acquisition.profile.rollback", { serviceLine: line });
  if (note.trim().length === 0) {
    throw new AppError("VALIDATION_FAILED", "Rollback requires a non-empty note.");
  }

  return withTransaction(async (tx) => {
    const target = await tx.serviceLineProfileVersion.findFirst({
      where: { serviceLine: line, version },
      select: { id: true, status: true, version: true, profile: true },
    });
    if (target === null) {
      throw new AppError("NOT_FOUND", `Version ${String(version)} not found for ${line}`);
    }
    if (target.status === "DRAFT") {
      throw new AppError("VALIDATION_FAILED", "Cannot roll back to a DRAFT version.");
    }

    const issues = validateProfile(target.profile);
    if (hasErrors(issues)) {
      throw new AppError(
        "VALIDATION_FAILED",
        "Rollback target failed validation against current known references.",
        { details: { issues: issues.filter((i) => i.severity === "error") } },
      );
    }

    const previouslyActive = await tx.serviceLineProfileVersion.findFirst({
      where: { serviceLine: line, isActive: true },
      select: { id: true, version: true },
    });
    if (previouslyActive !== null && previouslyActive.id !== target.id) {
      await tx.serviceLineProfileVersion.update({
        where: { id: previouslyActive.id },
        data: { isActive: false, status: "ARCHIVED" },
      });
    }

    const publishedById = actor.type === "USER" ? actor.userId : await systemActorUserId(tx);
    const nowIso = new Date();
    const updated = await tx.serviceLineProfileVersion.update({
      where: { id: target.id },
      data: {
        status: "PUBLISHED",
        isActive: true,
        note,
        publishedById,
        publishedAt: nowIso,
      },
      select: { id: true, version: true },
    });

    await audit.record(tx, {
      actor,
      action: "acquisition.profile.rollback",
      targetType: "ServiceLineProfileVersion",
      targetId: updated.id,
      before: previouslyActive === null ? undefined : { version: previouslyActive.version },
      after: { serviceLine: line, version: updated.version, note },
    });

    await publishAfterCommit(tx, {
      name: "profile.published",
      actor,
      payload: {
        serviceLine: line,
        version: updated.version,
        previousVersion: previouslyActive?.version ?? null,
      },
    });

    return { version: updated.version, previousVersion: previouslyActive?.version ?? null };
  });
}

/**
 * For SYSTEM actors, pick a placeholder user id for the row's `createdById` column (which
 * is NOT NULL). We pick the first ADMIN user; if none exists (test DB), we throw so the
 * caller upgrades the test setup — this is a Phase 2 seed guarantee.
 */
async function systemActorUserId(tx: Tx): Promise<string> {
  const admin = await tx.user.findFirst({
    where: { role: "ADMIN", status: "ACTIVE" },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  if (admin === null) {
    throw new AppError(
      "INTERNAL",
      "Cannot resolve a system-actor userId: no ADMIN user exists in the database.",
    );
  }
  return admin.id;
}

