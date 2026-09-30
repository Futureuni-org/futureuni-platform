/**
 * Suppression management (Phase 9). Every mutation is audited and every add fans out to stop
 * matching enrolments and transition matching open leads to SUPPRESSED in the same transaction.
 *
 * `INV-2` says the suppression check runs in the same code path as a send (Phase 12).
 * `INV-3` says a suppression must stop every ACTIVE/PAUSED enrolment at the company.
 */

import "server-only";

import type { Actor, SuppressionReason, SuppressionSource, SuppressionType } from "@/contracts/common";
import { AppError } from "@/lib/errors";
import { assertActorCan } from "@/platform/auth";
import { audit, withAudit } from "@/platform/audit-log";
import { db, isUniqueViolation, withTransaction, type Tx } from "@/platform/db";
import { publishAfterCommit } from "@/platform/events";
import {
  hashSuppressionValue,
  normalizeSuppressionValue,
  transitionLead,
} from "@/modules/acquisition/core";

export interface AddSuppressionInput {
  type: SuppressionType;
  value: string;
  reason: SuppressionReason;
  source: SuppressionSource;
  note?: string;
  /** Store the value as a SHA-256 hash (used by DSR delete). */
  hashed?: boolean;
}

export interface SuppressionCascade {
  suppressionId: string;
  stoppedEnrollments: number;
  suppressedLeads: number;
  affectedCompanyIds: string[];
}

/**
 * Adds a suppression, stops matching enrolments, and moves any open matching leads to
 * SUPPRESSED — all in one transaction. Idempotent on `(type, value)` for a live suppression:
 * a second call returns the existing row without side-effects.
 */
export async function addSuppression(
  actor: Actor,
  input: AddSuppressionInput,
): Promise<SuppressionCascade> {
  await assertActorCan(actor, "acquisition.suppression.add");
  const normalised = input.hashed === true
    ? hashSuppressionValue(input.value)
    : normalizeSuppressionValue(input.type, input.value);
  if (normalised === null || normalised === "") {
    throw new AppError("VALIDATION_FAILED", `Cannot normalise suppression value for ${input.type}.`);
  }
  const created = actor.type === "USER" ? actor.userId : null;

  return withTransaction(async (tx) => {
    // Idempotent insert.
    let suppressionId: string;
    try {
      const row = await tx.suppression.create({
        data: {
          type: input.type,
          value: normalised,
          isHashed: input.hashed ?? false,
          reason: input.reason,
          source: input.source,
          ...(input.note === undefined ? {} : { note: input.note }),
          createdById: created,
        },
        select: { id: true },
      });
      suppressionId = row.id;
    } catch (error) {
      if (isUniqueViolation(error)) {
        const existing = await tx.suppression.findFirst({
          where: { type: input.type, value: normalised, removedAt: null },
          select: { id: true },
        });
        if (existing === null) throw error;
        return { suppressionId: existing.id, stoppedEnrollments: 0, suppressedLeads: 0, affectedCompanyIds: [] };
      }
      throw error;
    }

    const cascade = await cascadeSuppression(tx, input.type, normalised);

    await publishAfterCommit(tx, {
      name: "compliance.suppressed",
      actor,
      payload: {
        suppressionId,
        type: input.type,
        affectedLeadIds: [],
        stoppedEnrollments: cascade.stoppedEnrollments,
      },
    });

    await audit.record(tx, {
      actor,
      action: "acquisition.suppression.add",
      targetType: "Suppression",
      targetId: suppressionId,
      after: {
        type: input.type,
        reason: input.reason,
        source: input.source,
        note: input.note ?? null,
        stoppedEnrollments: cascade.stoppedEnrollments,
        suppressedLeads: cascade.suppressedLeads,
      },
    });

    return { suppressionId, ...cascade };
  });
}

async function cascadeSuppression(
  tx: Tx,
  type: SuppressionType,
  normalised: string,
): Promise<{ stoppedEnrollments: number; suppressedLeads: number; affectedCompanyIds: string[] }> {
  // Find matching contacts/companies to cascade to.
  let contactIds: string[] = [];
  let companyIds: string[] = [];
  if (type === "EMAIL") {
    const contacts = await tx.contact.findMany({ where: { email: normalised, deletedAt: null }, select: { id: true, companyId: true } });
    contactIds = contacts.map((c) => c.id);
    companyIds = [...new Set(contacts.map((c) => c.companyId))];
  } else if (type === "PHONE") {
    const contacts = await tx.contact.findMany({ where: { phone: normalised, deletedAt: null }, select: { id: true, companyId: true } });
    contactIds = contacts.map((c) => c.id);
    companyIds = [...new Set(contacts.map((c) => c.companyId))];
  } else {
    // type === "DOMAIN"
    const companies = await tx.company.findMany({ where: { normalizedDomain: normalised, deletedAt: null }, select: { id: true } });
    companyIds = companies.map((c) => c.id);
  }

  // Stop active/paused enrolments at any matching company or contact.
  const enrollmentWhere: Parameters<typeof tx.enrollment.updateMany>[0]["where"] = {
    status: { in: ["ACTIVE", "PAUSED"] },
    OR: [
      ...(companyIds.length === 0 ? [] : [{ companyId: { in: companyIds } }]),
      ...(contactIds.length === 0 ? [] : [{ contactId: { in: contactIds } }]),
    ],
  };
  let stopped = { count: 0 };
  if ((companyIds.length > 0) || (contactIds.length > 0)) {
    stopped = await tx.enrollment.updateMany({
      where: enrollmentWhere,
      data: { status: "STOPPED", stoppedReason: "SUPPRESSED", stoppedAt: new Date() },
    });
  }

  // Transition matching open leads to SUPPRESSED.
  let suppressedLeadCount = 0;
  if (companyIds.length > 0) {
    const openLeads = await tx.lead.findMany({
      where: {
        companyId: { in: companyIds },
        status: { in: ["NEW", "ENRICHING", "ENRICHED", "AUDITING", "AUDITED", "SCORED", "IN_REVIEW", "APPROVED", "CONTACTED", "REPLIED", "MEETING_BOOKED", "PROPOSAL_SENT", "NURTURE"] },
      },
      select: { id: true },
    });
    for (const lead of openLeads) {
      await transitionLead(tx, {
        leadId: lead.id,
        to: "SUPPRESSED",
        actor: { type: "SYSTEM", job: "acquisition.compliance.suppression" },
        reason: "suppression",
      });
      suppressedLeadCount += 1;
    }
  }
  return { stoppedEnrollments: stopped.count, suppressedLeads: suppressedLeadCount, affectedCompanyIds: companyIds };
}

/** Remove a live suppression. ADMIN only, reason required, audited. */
export async function removeSuppression(
  actor: Actor,
  suppressionId: string,
  reason: string,
): Promise<void> {
  await assertActorCan(actor, "acquisition.suppression.remove");
  if (reason.trim() === "") throw new AppError("VALIDATION_FAILED", "A reason is required to remove a suppression.");
  await withTransaction((tx) =>
    withAudit(
      tx,
      {
        actor,
        action: "acquisition.suppression.remove",
        targetType: "Suppression",
        targetId: suppressionId,
        after: { reason },
      },
      async (inner) => {
        await inner.suppression.update({
          where: { id: suppressionId },
          data: {
            removedAt: new Date(),
            removedById: actor.type === "USER" ? actor.userId : null,
            removedReason: reason.slice(0, 500),
          },
        });
      },
    ),
  );
}

export interface ListSuppressionsQuery {
  type?: SuppressionType;
  reason?: SuppressionReason;
  includeRemoved?: boolean;
  cursor?: string;
  limit?: number;
}

export async function listSuppressions(actor: Actor, query: ListSuppressionsQuery = {}): Promise<{
  items: {
    id: string;
    type: SuppressionType;
    value: string;
    isHashed: boolean;
    reason: SuppressionReason;
    source: SuppressionSource;
    note: string | null;
    createdAt: Date;
    removedAt: Date | null;
  }[];
  nextCursor: string | null;
}> {
  await assertActorCan(actor, "acquisition.suppression.read");
  const limit = Math.min(Math.max(query.limit ?? 25, 1), 100);
  const rows = await db.suppression.findMany({
    where: {
      ...(query.type === undefined ? {} : { type: query.type }),
      ...(query.reason === undefined ? {} : { reason: query.reason }),
      ...(query.includeRemoved === true ? {} : { removedAt: null }),
      ...(query.cursor === undefined ? {} : { id: { lt: query.cursor } }),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    select: { id: true, type: true, value: true, isHashed: true, reason: true, source: true, note: true, createdAt: true, removedAt: true },
  });
  const items = rows.slice(0, limit);
  const last = items[items.length - 1];
  return { items, nextCursor: rows.length > limit && last !== undefined ? last.id : null };
}

/** Import suppressions from a CSV (columns: type,value,reason,source[,note]). ADMIN/MANAGER only. */
export async function importSuppressions(actor: Actor, csv: string): Promise<{ added: number; skipped: number; errors: string[] }> {
  await assertActorCan(actor, "acquisition.suppression.import");
  const lines = csv.split(/\r?\n/).filter((line) => line.trim() !== "");
  const [headerLine, ...rows] = lines;
  if (headerLine === undefined) return { added: 0, skipped: 0, errors: [] };
  const header = headerLine.split(",").map((h) => h.trim().toLowerCase());
  const idx = {
    type: header.indexOf("type"),
    value: header.indexOf("value"),
    reason: header.indexOf("reason"),
    source: header.indexOf("source"),
    note: header.indexOf("note"),
  };
  if (idx.type < 0 || idx.value < 0 || idx.reason < 0 || idx.source < 0) {
    return { added: 0, skipped: 0, errors: ["CSV must have columns: type,value,reason,source[,note]"] };
  }
  const errors: string[] = [];
  let added = 0;
  let skipped = 0;
  for (const raw of rows) {
    const cols = parseCsvRow(raw);
    try {
      const noteCol = idx.note >= 0 ? cols[idx.note] : undefined;
      const cascade = await addSuppression(actor, {
        type: cols[idx.type] as SuppressionType,
        value: cols[idx.value] ?? "",
        reason: cols[idx.reason] as SuppressionReason,
        source: cols[idx.source] as SuppressionSource,
        ...(noteCol === undefined ? {} : { note: noteCol }),
      });
      if (cascade.stoppedEnrollments === 0 && cascade.suppressedLeads === 0 && cascade.affectedCompanyIds.length === 0) {
        // Might be an existing (idempotent) row — still counts as added; skip only on validation error.
      }
      added += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(message.slice(0, 200));
      skipped += 1;
    }
  }
  return { added, skipped, errors };
}

function parseCsvRow(row: string): (string | undefined)[] {
  const out: (string | undefined)[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < row.length; i += 1) {
    const ch = row[i];
    if (ch === undefined) continue;
    if (ch === '"') {
      if (inQuotes && row[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      out.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  out.push(current);
  return out;
}
