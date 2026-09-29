/**
 * Wave 1 seams (docs/prompts/wave-1/wave-1-prep-and-merge.md Part B).
 *
 * These stubs match the fixed signatures the parallel phases agreed on. At merge time (Wave 1
 * integration, Part C3) each one is replaced with the real implementation from Phase 6:
 *
 *   - SEAM-AUTH-EMAIL → `@/platform/notifications` `sendEmail` and templates
 *   - SEAM-AUDIT      → `@/platform/audit-log` `audit.record`
 *
 * Rules:
 *   - The stand-in never leaves the file it lives in; callers import from `_seams.ts`.
 *   - `SEAM-AUTH-EMAIL` never logs the link in production. In development it writes a
 *     structured line to the server log; when `NODE_ENV === "test"` it also appends to a
 *     JSONL file so Playwright can read the link the test just triggered.
 *   - `SEAM-AUDIT` writes directly to `AuditLog`, matching INV-20 (append-only).
 *   - The stand-in works in mock mode.
 */

import "server-only";

import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

import type { Actor } from "@/contracts/common";
import { dbOr, type Tx } from "@/platform/db";

// SEAM:SEAM-AUTH-EMAIL — stand-in until Phase 6 wires the real notification email adapter.
export interface AuthEmailInput {
  kind: "invite" | "verify-email" | "password-reset" | "role-changed" | "2fa-enabled";
  to: string;
  name?: string;
  link?: string;
  meta?: Record<string, string>;
}

const TEST_HOOK_FILE = ".storage/test/auth-emails.jsonl";

export async function sendAuthEmail(input: AuthEmailInput): Promise<void> {
  // Never log links in production, even from the stand-in.
  if (process.env.NODE_ENV === "production") return;

  const line = {
    at: new Date().toISOString(),
    kind: input.kind,
    to: input.to,
    ...(input.name === undefined ? {} : { name: input.name }),
    ...(input.link === undefined ? {} : { link: input.link }),
    ...(input.meta === undefined ? {} : { meta: input.meta }),
  };
  console.warn(`[auth-email] ${JSON.stringify(line)}`);

  if (process.env.NODE_ENV === "test") {
    try {
      await mkdir(dirname(TEST_HOOK_FILE), { recursive: true });
      await appendFile(TEST_HOOK_FILE, `${JSON.stringify(line)}\n`);
    } catch {
      // Fall through: the console line above is authoritative when the file can't be written.
    }
  }
}

// SEAM:SEAM-AUDIT — stand-in until Phase 6 wires @/platform/audit-log.
export interface AuditEntry {
  actor: Actor;
  action: string;
  targetType: string;
  targetId: string;
  before?: unknown;
  after?: unknown;
  ip?: string;
  userAgent?: string;
}

export async function recordAudit(tx: Tx | null, entry: AuditEntry): Promise<void> {
  await dbOr(tx).auditLog.create({
    data: {
      actorType: entry.actor.type,
      actorId: entry.actor.type === "USER" ? entry.actor.userId : null,
      actorLabel: entry.actor.type === "SYSTEM" ? entry.actor.job : null,
      action: entry.action,
      targetType: entry.targetType,
      targetId: entry.targetId,
      ...(entry.before === undefined ? {} : { before: toJson(entry.before) }),
      ...(entry.after === undefined ? {} : { after: toJson(entry.after) }),
      ip: entry.ip ?? null,
      userAgent: entry.userAgent ?? null,
    },
  });
}

function toJson(value: unknown): object {
  // Prisma's Json column accepts any JSON value; wrap scalars so the column type is happy.
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return { value };
  }
  return value;
}
