import "server-only";

/**
 * Reporting services (API-28, Phase 18's UI reads these). Aggregates AiCall rows into
 * task / module / user / model / day buckets, and buckets by outcome for Phase 17's
 * "AI cost per won deal" metric.
 */

import type { Actor, AiOutcome } from "@/contracts/common";
import { db } from "@/platform/db";

import { assertActorCan } from "@/platform/auth";

export type UsageGroupBy = "task" | "module" | "user" | "model" | "day";

export interface UsageBucket {
  groupKey: string;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  costMicros: number;
  outcomes: Partial<Record<AiOutcome, number>>;
}

interface AiCallSlim {
  task: string;
  module: string | null;
  actorId: string | null;
  model: string;
  createdAt: Date;
  inputTokens: number;
  outputTokens: number;
  costMicros: number;
  outcome: AiOutcome;
}

/** getUsageSummary — requires platform.aiUsage.read. */
export async function getUsageSummary(args: {
  actor: Actor;
  from: Date;
  to: Date;
  groupBy: UsageGroupBy;
}): Promise<UsageBucket[]> {
  await assertActorCan(args.actor, "platform.aiUsage.read");
  const rows: AiCallSlim[] = await db.aiCall.findMany({
    where: { createdAt: { gte: args.from, lte: args.to } },
    select: {
      task: true,
      module: true,
      actorId: true,
      model: true,
      createdAt: true,
      inputTokens: true,
      outputTokens: true,
      costMicros: true,
      outcome: true,
    },
  });
  return bucketRows(rows, args.groupBy);
}

/** getCostPerOutcome — requires platform.aiUsage.read. */
export async function getCostPerOutcome(args: {
  actor: Actor;
  from: Date;
  to: Date;
}): Promise<{ outcome: AiOutcome; calls: number; costMicros: number }[]> {
  await assertActorCan(args.actor, "platform.aiUsage.read");
  const rows = await db.aiCall.groupBy({
    by: ["outcome"],
    where: { createdAt: { gte: args.from, lte: args.to } },
    _sum: { costMicros: true },
    _count: { _all: true },
  });
  return rows.map((r) => ({
    outcome: r.outcome,
    calls: r._count._all,
    costMicros: r._sum.costMicros ?? 0,
  }));
}

function bucketRows(rows: readonly AiCallSlim[], groupBy: UsageGroupBy): UsageBucket[] {
  const map = new Map<string, UsageBucket>();
  for (const r of rows) {
    const key = keyFor(r, groupBy);
    let b = map.get(key);
    if (!b) {
      b = {
        groupKey: key,
        calls: 0,
        inputTokens: 0,
        outputTokens: 0,
        costMicros: 0,
        outcomes: {},
      };
      map.set(key, b);
    }
    b.calls += 1;
    b.inputTokens += r.inputTokens;
    b.outputTokens += r.outputTokens;
    b.costMicros += r.costMicros;
    b.outcomes[r.outcome] = (b.outcomes[r.outcome] ?? 0) + 1;
  }
  return Array.from(map.values()).sort((a, b) => b.costMicros - a.costMicros);
}

function keyFor(row: AiCallSlim, groupBy: UsageGroupBy): string {
  switch (groupBy) {
    case "task":
      return row.task;
    case "module":
      return row.module ?? "(none)";
    case "user":
      return row.actorId ?? "system";
    case "model":
      return row.model;
    case "day": {
      const d = row.createdAt;
      const y = d.getUTCFullYear();
      const m = String(d.getUTCMonth() + 1).padStart(2, "0");
      const day = String(d.getUTCDate()).padStart(2, "0");
      return `${String(y)}-${m}-${day}`;
    }
  }
}
