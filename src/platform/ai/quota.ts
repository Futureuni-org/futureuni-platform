import "server-only";

/**
 * Quota and budget enforcement (US-17). Runs BEFORE the provider call.
 *
 *  - Platform daily USD (sum of AiCall.costMicros since 00:00 UTC).
 *  - Platform monthly USD (since first of month, UTC).
 *  - Per-module daily USD.
 *  - Per-user daily call count.
 *
 * At 80% of a budget an `ai.budget.warning` event is emitted (deduplicated per window). At
 * 100% the call is blocked with AppError("AI_QUOTA_EXCEEDED") and `ai.budget.exceeded` is
 * emitted. Events are logged locally until Phase 6's events publisher is wired in
 * (see phases/05/REQUESTS.md).
 */

import type { AiSettings } from "@/contracts/ai-service";
import type { Actor } from "@/contracts/common";
import { db } from "@/platform/db";

import { aiQuotaExceeded } from "./errors";
import { getAiSettings } from "./_seams";

const USD_TO_MICROS = 1_000_000;

function usdToMicros(usd: number): number {
  return Math.round(usd * USD_TO_MICROS);
}

function startOfUtcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function startOfUtcMonth(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/**
 * Emit intent stub: until Phase 6's events publisher lands, budget warnings/exceeded events
 * are recorded on the console (structured, no PII) so they show up in local logs.
 */
type BudgetScope =
  | "platform.daily"
  | "platform.monthly"
  | `module:${string}.daily`
  | `user:${string}.daily`;

interface BudgetSignal {
  kind: "warning" | "exceeded";
  scope: BudgetScope;
  usedMicros: number;
  limitMicros: number;
  percent: number;
}

/**
 * In-memory dedup: a warning per (scope, window) fires only once. Windows keyed by the
 * start of the day (or month) so the set naturally clears out. Two side-notes:
 *   - Serverless: this Set is per-instance; Phase 6's notification-router replaces it with
 *     a persistent dedupe (event key + a "digest per hour" policy) at Wave-1 merge.
 *   - `exceeded` is not deduplicated — each blocked call still logs so the audit trail
 *     shows every attempt.
 */
const WARNED = new Set<string>();
const MAX_WARNED_ENTRIES = 512;

function shouldEmitWarning(scope: BudgetScope, windowStart: Date): boolean {
  const key = `${scope}|${String(windowStart.getTime())}`;
  if (WARNED.has(key)) return false;
  if (WARNED.size >= MAX_WARNED_ENTRIES) WARNED.clear();
  WARNED.add(key);
  return true;
}

function reportBudgetSignal(signal: BudgetSignal): void {
  const line = JSON.stringify({ event: `ai.budget.${signal.kind}`, ...signal });
  if (signal.kind === "exceeded") {
    console.error(line);
  } else {
    console.warn(line);
  }
}

/** For tests only. */
export function __resetBudgetDedupForTests(): void {
  WARNED.clear();
}

interface QuotaCheckArgs {
  actor: Actor;
  module?: string;
  now: Date;
  /** Estimated cost in micro-USD for this specific call, used only for messages. */
  estimatedMicros?: number;
  settings?: AiSettings;
}

/**
 * Runs every budget check. On a hit: emits the appropriate signal(s) and throws
 * AI_QUOTA_EXCEEDED. On a warning threshold: emits ai.budget.warning and returns.
 */
export async function checkQuotasBeforeCall(args: QuotaCheckArgs): Promise<void> {
  const settings = args.settings ?? (await getAiSettings());
  const dayStart = startOfUtcDay(args.now);
  const monthStart = startOfUtcMonth(args.now);

  const platformDailyLimitMicros = usdToMicros(settings.budgets.platformDailyUsd);
  const platformMonthlyLimitMicros = usdToMicros(settings.budgets.platformMonthlyUsd);
  const perUserDailyCalls = settings.budgets.perUserDailyCalls;
  const perModuleDailyLimits = settings.budgets.perModuleDailyUsd;

  // Aggregate today's spend and (optionally) this month's spend.
  const [dailyRow, monthlyRow] = await Promise.all([
    db.aiCall.aggregate({
      _sum: { costMicros: true },
      where: { createdAt: { gte: dayStart } },
    }),
    db.aiCall.aggregate({
      _sum: { costMicros: true },
      where: { createdAt: { gte: monthStart } },
    }),
  ]);
  const dailyMicros = dailyRow._sum.costMicros ?? 0;
  const monthlyMicros = monthlyRow._sum.costMicros ?? 0;

  // Platform daily
  evaluate("platform.daily", dailyMicros, platformDailyLimitMicros, dayStart);

  // Platform monthly
  evaluate("platform.monthly", monthlyMicros, platformMonthlyLimitMicros, monthStart);

  // Per-module daily
  if (args.module !== undefined) {
    const moduleLimitUsd = perModuleDailyLimits[args.module];
    if (moduleLimitUsd !== undefined) {
      const moduleRow = await db.aiCall.aggregate({
        _sum: { costMicros: true },
        where: { createdAt: { gte: dayStart }, module: args.module },
      });
      const moduleMicros = moduleRow._sum.costMicros ?? 0;
      evaluate(
        `module:${args.module}.daily`,
        moduleMicros,
        usdToMicros(moduleLimitUsd),
        dayStart,
      );
    }
  }

  // Per-user daily call count
  if (args.actor.type === "USER" && perUserDailyCalls > 0) {
    const userCalls = await db.aiCall.count({
      where: { createdAt: { gte: dayStart }, actorId: args.actor.userId },
    });
    const scope: BudgetScope = `user:${args.actor.userId}.daily`;
    if (userCalls >= perUserDailyCalls) {
      reportBudgetSignal({
        kind: "exceeded",
        scope,
        usedMicros: userCalls,
        limitMicros: perUserDailyCalls,
        percent: 100,
      });
      throw aiQuotaExceeded({ scope, calls: userCalls });
    }
    const percent = Math.floor((userCalls / perUserDailyCalls) * 100);
    if (percent >= 80 && userCalls < perUserDailyCalls && shouldEmitWarning(scope, dayStart)) {
      reportBudgetSignal({
        kind: "warning",
        scope,
        usedMicros: userCalls,
        limitMicros: perUserDailyCalls,
        percent,
      });
    }
  }
}

function evaluate(scope: BudgetScope, used: number, limit: number, windowStart: Date): void {
  if (limit <= 0) return; // 0 = unlimited
  const percent = Math.floor((used / limit) * 100);
  if (used >= limit) {
    reportBudgetSignal({ kind: "exceeded", scope, usedMicros: used, limitMicros: limit, percent });
    throw aiQuotaExceeded({ scope, usedMicros: used, limitMicros: limit });
  }
  if (percent >= 80 && shouldEmitWarning(scope, windowStart)) {
    reportBudgetSignal({ kind: "warning", scope, usedMicros: used, limitMicros: limit, percent });
  }
}
