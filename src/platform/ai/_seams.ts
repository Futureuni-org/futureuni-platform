import "server-only";

/**
 * Wave-1 seam stand-ins for Phase 5 (AI service).
 *
 * Every seam here has a fixed signature and a `// SEAM:<ID>` marker. At Wave-1 merge (Part C3
 * of docs/prompts/wave-1-prep-and-merge.md) each stand-in is replaced by the real
 * implementation from Phase 3 or Phase 6, tracked in phases/05/REQUESTS.md.
 *
 * Rule: NOTHING in this file imports Phase 3, 4 or 6 code. It reads only env, contracts and
 * @/platform/db (already merged) — every callback returns from local values, not from other
 * unmerged platform modules.
 */

import type { AiSettings } from "@/contracts/ai-service";
import type { Actor } from "@/contracts/common";
import { env } from "@/env";
import { AppError } from "@/lib/errors";

// -------------------------------------------------------------------------------------------
// SEAM: SEAM-AI-CREDENTIALS  (Phase 6 replaces with @/platform/credentials.getProviderKey)
// -------------------------------------------------------------------------------------------
export type ProviderKey = "anthropic";

// SEAM:SEAM-AI-CREDENTIALS
export function getProviderKey(provider: ProviderKey): Promise<string | null> {
  // Future providers (Bedrock, Google) will branch on `provider`; today only Anthropic is
  // registered, and any other value falls back to a null key.
  const key: string | null =
    provider.length > 0 && env.ANTHROPIC_API_KEY !== undefined
      ? env.ANTHROPIC_API_KEY
      : null;
  return Promise.resolve(key);
}

// -------------------------------------------------------------------------------------------
// SEAM: SEAM-SETTINGS-AI  (Phase 6 replaces with @/platform/settings.getAiSettings)
//
// Stand-in defaults are chosen for a small Nigerian team: platform daily $10, monthly $100,
// per-user 200 calls/day, no per-module cap. Model tiers come from env; when a variable is
// unset we fall back to the current-generation default.
// -------------------------------------------------------------------------------------------

const DEFAULT_MODEL_TIERS = {
  fast: "claude-haiku-4-5",
  balanced: "claude-sonnet-5-5",
  deep: "claude-opus-5-5",
} as const;

// SEAM:SEAM-SETTINGS-AI
export function getAiSettings(): Promise<AiSettings> {
  const fallback = {
    fast: env.AI_MODEL_FAST_FALLBACK,
    balanced: env.AI_MODEL_BALANCED_FALLBACK,
    deep: env.AI_MODEL_DEEP_FALLBACK,
  };
  return Promise.resolve({
    modelTiers: {
      fast: env.AI_MODEL_FAST ?? DEFAULT_MODEL_TIERS.fast,
      balanced: env.AI_MODEL_BALANCED ?? DEFAULT_MODEL_TIERS.balanced,
      deep: env.AI_MODEL_DEEP ?? DEFAULT_MODEL_TIERS.deep,
    },
    fallbackModels: {
      ...(fallback.fast === undefined ? {} : { fast: fallback.fast }),
      ...(fallback.balanced === undefined ? {} : { balanced: fallback.balanced }),
      ...(fallback.deep === undefined ? {} : { deep: fallback.deep }),
    },
    budgets: {
      platformDailyUsd: 10,
      platformMonthlyUsd: 100,
      perModuleDailyUsd: {},
      perUserDailyCalls: 200,
    },
    logContentOverrides: {},
  });
}

// -------------------------------------------------------------------------------------------
// SEAM: SEAM-PERMISSION  (Phase 3 replaces with @/platform/auth.assertActorCan)
//
// Stand-in: allow SYSTEM actors always. For USER actors, allow only role="ADMIN" for the
// admin-scoped ai.* actions; deny others with FORBIDDEN.
// -------------------------------------------------------------------------------------------

/** Actions Phase 5 checks. Full list registered by the platform core-manifest at Wave-1 merge. */
export type PermissionAction =
  | "platform.prompt.publish"
  | "platform.prompt.activate"
  | "platform.prompt.read"
  | "platform.aiUsage.read"
  | "platform.aiBudget.update"
  | "platform.eval.run";

// SEAM:SEAM-PERMISSION
export function assertActorCan(actor: Actor, action: PermissionAction): void {
  if (actor.type === "SYSTEM") return;
  if (actor.role === "ADMIN") return;
  throw new AppError("FORBIDDEN", undefined, { details: { action, role: actor.role } });
}

// -------------------------------------------------------------------------------------------
// SEAM: SEAM-AUDIT  (Phase 6 replaces with @/platform/audit-log.recordAudit)
//
// Stand-in: writes a bare AuditLog row directly through @/platform/db using the same shape
// Phase 6's audit-log module exposes. Both plain and transactional callers are supported.
// -------------------------------------------------------------------------------------------

import { db, Prisma, toJsonInput, type Tx } from "@/platform/db";

export interface AuditEntry {
  actor: Actor;
  /** Dotted action, module.resource.verb — e.g. "platform.prompt.publish" or ".activate". */
  action: string;
  /** Prisma model name of the entity being audited — e.g. "PromptVersion". */
  targetType: string;
  /** Primary key of the audited entity. */
  targetId: string;
  /** Optional JSON snapshot of state before the change; must not carry secrets. */
  before?: Record<string, unknown>;
  /** Optional JSON snapshot of state after the change; must not carry secrets. */
  after?: Record<string, unknown>;
}

// SEAM:SEAM-AUDIT
export async function recordAudit(tx: Tx | null, entry: AuditEntry): Promise<void> {
  const client = tx ?? db;
  await client.auditLog.create({
    data: {
      actorType: entry.actor.type,
      actorId: entry.actor.type === "USER" ? entry.actor.userId : null,
      actorLabel: entry.actor.type === "SYSTEM" ? entry.actor.job : null,
      action: entry.action,
      targetType: entry.targetType,
      targetId: entry.targetId,
      before: entry.before === undefined ? Prisma.JsonNull : toJsonInput(entry.before),
      after: entry.after === undefined ? Prisma.JsonNull : toJsonInput(entry.after),
    },
  });
}
