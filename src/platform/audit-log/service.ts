/**
 * Append-only audit log (Phase 6, `INV-20`).
 *
 * `audit.record(txOrNull, entry)` is the exact `SEAM-AUDIT` shape from wave-1-prep-and-merge.md:
 * actor + `module.resource.verb` action + target + optional before/after + request context.
 * `withAudit(tx, entry, fn)` runs a mutation and records the entry in the same transaction.
 *
 * `before` and `after` are redacted before being stored (see `redact.ts`).
 */

import "server-only";

import type { Actor } from "@/contracts/common";
import type { PermissionAction } from "@/contracts/permissions";
import { AppError } from "@/lib/errors";
import { db, Prisma, toJsonInput, type Tx } from "@/platform/db";

import { redact } from "./redact";

export interface AuditEntry {
  actor: Actor;
  /** `module.resource.verb`, one of the actions registered by any manifest. */
  action: PermissionAction  ;
  targetType: string;
  targetId: string;
  before?: unknown;
  after?: unknown;
  ip?: string;
  userAgent?: string;
  requestId?: string;
}

function actorFields(actor: Actor): { actorType: Actor["type"]; actorId: string | null; actorLabel: string | null } {
  if (actor.type === "SYSTEM") {
    return { actorType: "SYSTEM", actorId: null, actorLabel: actor.job };
  }
  return { actorType: "USER", actorId: actor.userId, actorLabel: null };
}

async function insert(
  client: Tx | typeof db,
  entry: AuditEntry,
): Promise<{ id: string }> {
  const { actorType, actorId, actorLabel } = actorFields(entry.actor);
  const before =
    entry.before === undefined || entry.before === null ? Prisma.JsonNull : toJsonInput(redact(entry.before));
  const after =
    entry.after === undefined || entry.after === null ? Prisma.JsonNull : toJsonInput(redact(entry.after));
  const row = await client.auditLog.create({
    data: {
      actorType,
      actorId,
      actorLabel,
      action: entry.action,
      targetType: entry.targetType,
      targetId: entry.targetId,
      before,
      after,
      ip: entry.ip ?? null,
      userAgent: entry.userAgent ?? null,
      requestId: entry.requestId ?? null,
    },
    select: { id: true },
  });
  return row;
}

/** The single audit surface. `SEAM-AUDIT` wires here. */
export const audit = {
  /**
   * Record an audit entry. Pass `tx` inside a transaction so the audit lives or rolls back with
   * the change; pass `null` for a standalone entry (settings and credential mutations do this).
   */
  async record(tx: Tx | null, entry: AuditEntry): Promise<{ id: string }> {
    return insert(tx ?? db, entry);
  },
};

/**
 * Run `fn` inside a transaction, record the audit entry with the same `tx`, and return the value.
 * The audit entry is written *after* `fn` succeeds, so it captures the final `after`. If either
 * step throws, both roll back.
 */
export async function withAudit<T>(
  tx: Tx,
  entry: AuditEntry,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  const value = await fn(tx);
  await insert(tx, entry);
  return value;
}

// ---- Queries -----------------------------------------------------------------------------

export interface AuditQuery {
  actorId?: string;
  action?: string;
  targetType?: string;
  targetId?: string;
  from?: Date;
  to?: Date;
  cursor?: string;
  limit?: number;
}

export interface AuditListItem {
  id: string;
  actorType: "USER" | "SYSTEM";
  actorId: string | null;
  actorLabel: string | null;
  action: string;
  targetType: string;
  targetId: string;
  before: unknown;
  after: unknown;
  ip: string | null;
  userAgent: string | null;
  requestId: string | null;
  createdAt: Date;
}

const MAX_LIMIT = 100;

/** List entries newest-first, cursor-paginated. */
export async function listAudit(query: AuditQuery): Promise<{ items: AuditListItem[]; nextCursor: string | null }> {
  const limit = Math.min(Math.max(query.limit ?? 25, 1), MAX_LIMIT);
  const where: Parameters<typeof db.auditLog.findMany>[0] = {
    where: {
      ...(query.actorId === undefined ? {} : { actorId: query.actorId }),
      ...(query.action === undefined ? {} : { action: query.action }),
      ...(query.targetType === undefined ? {} : { targetType: query.targetType }),
      ...(query.targetId === undefined ? {} : { targetId: query.targetId }),
      ...(query.from === undefined && query.to === undefined
        ? {}
        : {
            createdAt: {
              ...(query.from === undefined ? {} : { gte: query.from }),
              ...(query.to === undefined ? {} : { lte: query.to }),
            },
          }),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
  };
  if (query.cursor !== undefined) {
    const [cursorTime, cursorId] = decodeCursor(query.cursor);
    where.where = {
      ...where.where,
      OR: [
        { createdAt: { lt: cursorTime } },
        { createdAt: cursorTime, id: { lt: cursorId } },
      ],
    };
  }
  const rows = await db.auditLog.findMany(where);
  const items = rows.slice(0, limit).map(rowToItem);
  const last = rows[limit - 1];
  const nextCursor = rows.length > limit && last !== undefined ? encodeCursor(last.createdAt, last.id) : null;
  return { items, nextCursor };
}

/** Every entry for one target, newest-first. */
export async function getAuditForTarget(targetType: string, targetId: string): Promise<AuditListItem[]> {
  const rows = await db.auditLog.findMany({
    where: { targetType, targetId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 200,
  });
  return rows.map(rowToItem);
}

function rowToItem(row: {
  id: string;
  actorType: "USER" | "SYSTEM";
  actorId: string | null;
  actorLabel: string | null;
  action: string;
  targetType: string;
  targetId: string;
  before: unknown;
  after: unknown;
  ip: string | null;
  userAgent: string | null;
  requestId: string | null;
  createdAt: Date;
}): AuditListItem {
  return { ...row };
}

function encodeCursor(time: Date, id: string): string {
  return Buffer.from(`${time.toISOString()}|${id}`, "utf8").toString("base64url");
}

function decodeCursor(cursor: string): [Date, string] {
  try {
    const raw = Buffer.from(cursor, "base64url").toString("utf8");
    const idx = raw.lastIndexOf("|");
    if (idx <= 0) throw new Error("bad cursor");
    const time = new Date(raw.slice(0, idx));
    const id = raw.slice(idx + 1);
    if (Number.isNaN(time.getTime()) || id === "") throw new Error("bad cursor");
    return [time, id];
  } catch (cause) {
    throw new AppError("VALIDATION_FAILED", "Invalid cursor.", { cause });
  }
}

/**
 * CSV export for a date range. Sensitive keys are already redacted at insert time; the CSV
 * serialises `before` and `after` as compact JSON.
 */
export function exportAuditCsv(items: readonly AuditListItem[]): string {
  const header = [
    "id",
    "createdAt",
    "actorType",
    "actorId",
    "actorLabel",
    "action",
    "targetType",
    "targetId",
    "before",
    "after",
    "ip",
    "userAgent",
    "requestId",
  ].join(",");
  const rows = items.map((row) =>
    [
      row.id,
      row.createdAt.toISOString(),
      row.actorType,
      row.actorId ?? "",
      row.actorLabel ?? "",
      row.action,
      row.targetType,
      row.targetId,
      row.before === null ? "" : JSON.stringify(row.before),
      row.after === null ? "" : JSON.stringify(row.after),
      row.ip ?? "",
      row.userAgent ?? "",
      row.requestId ?? "",
    ]
      .map(csvCell)
      .join(","),
  );
  return `\uFEFF${[header, ...rows].join("\r\n")}\r\n`;
}

function csvCell(value: string): string {
  if (value === "") return "";
  if (/[",\r\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}
