import type { Metadata } from "next";

import { PageHeader } from "@/components/patterns/page-header";
import { PermissionState } from "@/components/patterns/states";
import { Section } from "@/components/patterns/section";
import { StatRow, type Stat } from "@/components/patterns/stat-row";
import { BarChart } from "@/components/charts/bar-chart";
import { LineChart } from "@/components/charts/line-chart";
import { actorOf, canFromUser, requireUser } from "@/platform/auth";
import type { CurrentUser } from "@/platform/auth";
import { getCostPerOutcome, getUsageSummary } from "@/platform/ai";
import { getSetting } from "@/platform/settings";

import { BudgetForm, ModelTiersForm, type Budgets, type ModelTiers } from "./_components/ai-budgets-client";

export const metadata: Metadata = { title: "AI usage · Admin" };

const usd = (micros: number): number => Math.round((micros / 1_000_000) * 100) / 100;
const fmtUsd = (n: number): string => new Intl.NumberFormat("en-GB", { style: "currency", currency: "USD" }).format(n);

async function loadAiUsage(user: CurrentUser) {
  const actor = actorOf(user);
  const now = new Date();
  const from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const [byDay, byModel, byOutcome, budgets, tiers] = await Promise.all([
    getUsageSummary({ actor, from, to: now, groupBy: "day" }),
    getUsageSummary({ actor, from, to: now, groupBy: "model" }),
    getCostPerOutcome({ actor, from, to: now }),
    getSetting<Budgets>("ai.budgets", {}),
    getSetting<ModelTiers>("ai.modelTiers", {}),
  ]);
  const days = [...byDay].sort((a, b) => a.groupKey.localeCompare(b.groupKey));
  const todayKey = now.toISOString().slice(0, 10);
  const spendToday = usd(days.find((d) => d.groupKey === todayKey)?.costMicros ?? 0);
  const spendMtd = usd(
    days.filter((d) => new Date(d.groupKey) >= monthStart).reduce((acc, d) => acc + d.costMicros, 0),
  );
  const callsTotal = days.reduce((acc, d) => acc + d.calls, 0);
  return { days, byModel, byOutcome, budgets, tiers, spendToday, spendMtd, callsTotal };
}

export default async function AiUsagePage() {
  const user = await requireUser();
  if (!canFromUser(user, "platform.aiUsage.read")) {
    return <PermissionState description="Only administrators can view AI usage." />;
  }

  const { days, byModel, byOutcome, budgets, tiers, spendToday, spendMtd, callsTotal } = await loadAiUsage(user);
  const canEditBudget = canFromUser(user, "platform.aiBudget.update");

  const stats: Stat[] = [
    { id: "today", label: "Spend today", value: fmtUsd(spendToday), hint: `of ${fmtUsd(budgets.platformDailyUsd)} daily` },
    { id: "mtd", label: "Spend this month", value: fmtUsd(spendMtd), hint: `of ${fmtUsd(budgets.platformMonthlyUsd)} monthly` },
    { id: "calls", label: "AI calls (30 days)", value: String(callsTotal) },
  ];

  const spendData = days.map((d) => ({ x: d.groupKey, usd: usd(d.costMicros), budget: budgets.platformDailyUsd }));
  const modelData = byModel.map((m) => ({ x: m.groupKey, usd: usd(m.costMicros) }));
  const outcomeData = byOutcome.map((o) => ({ x: o.outcome, calls: o.calls }));

  return (
    <div className="flex flex-col gap-10">
      <PageHeader eyebrow="Admin" title="AI usage and cost" description="Spend against budget, by model and by outcome, over the last 30 days." />

      <StatRow stats={stats} />

      <Section eyebrow="Spend" title="Daily spend vs budget" emphasized>
        <LineChart
          title="Daily AI spend (USD)"
          summary={`AI spend per day over the last 30 days, against the daily budget of ${fmtUsd(budgets.platformDailyUsd)}.`}
          data={spendData}
          series={[
            { key: "usd", label: "Spend (USD)" },
            { key: "budget", label: "Daily budget" },
          ]}
        />
      </Section>

      <div className="grid gap-8 lg:grid-cols-2">
        <Section eyebrow="By model" title="Cost by model">
          <BarChart
            title="AI cost by model (USD)"
            summary="Total AI spend grouped by model over the last 30 days."
            data={modelData}
            series={[{ key: "usd", label: "Cost (USD)" }]}
            horizontal
          />
        </Section>
        <Section eyebrow="By outcome" title="Calls by outcome">
          <BarChart
            title="AI calls by outcome"
            summary="AI calls grouped by outcome (ok, repaired, invalid, timeout, error, quota-blocked)."
            data={outcomeData}
            series={[{ key: "calls", label: "Calls" }]}
            horizontal
          />
        </Section>
      </div>

      <BudgetForm initial={budgets} canEdit={canEditBudget} />
      <ModelTiersForm initial={tiers} canEdit={canEditBudget} />

      <p className="text-xs text-muted">
        Cost per won deal and p95 latency aren&apos;t surfaced yet (p95 isn&apos;t aggregated by the
        reporting service; see the phase requests).
      </p>
    </div>
  );
}
