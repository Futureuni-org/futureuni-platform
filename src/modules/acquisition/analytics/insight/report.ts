/**
 * The weekly report (US-43 AC-43.3): build the insight input, generate the insight, and email it
 * with the headline metrics to managers and admins through the platform notify channel (a branded
 * template, Phase 6). Dedupe is per ISO week, so a duplicated Monday tick never emails twice
 * (INV-22). Honours the `weeklyReportEnabled` setting.
 */

import "server-only";

import type { Actor, ServiceLine } from "@/contracts/common";
import { notify } from "@/platform/notifications";

import { generateWeeklyInsight } from "./generate";
import { buildWeeklyInsightInput } from "./input";
import type { WeeklyInsightOutput } from "./schema";
import { ANALYTICS_NOTIFICATION_TYPES } from "../notifications";
import { isWeeklyReportEnabled } from "../settings";

const ALL_LINES: ServiceLine[] = ["WEB_DEVELOPMENT", "UI_UX_DESIGN", "GRAPHIC_DESIGN", "VIDEO_EDITING"];

/** ISO-8601 week key, e.g. "2026-W40", for once-per-week dedupe. */
function isoWeekKey(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${String(d.getUTCFullYear())}-W${String(week).padStart(2, "0")}`;
}

/** Plain-text body for the email and in-app notification (the model never writes the footer). */
function renderBody(insight: WeeklyInsightOutput): string {
  const lines = [insight.headline, ""];
  if (insight.points.length > 0) {
    lines.push("What changed:");
    for (const p of insight.points) lines.push(`- ${p.text}`);
    lines.push("");
  }
  if (insight.watchouts.length > 0) {
    lines.push("Watch outs:");
    for (const w of insight.watchouts) lines.push(`- ${w.text}`);
  }
  return lines.join("\n").trim();
}

export interface WeeklyReportResult {
  emailed: number;
  skipped: boolean;
}

export async function runWeeklyReport(now: Date, jobRunId: string): Promise<WeeklyReportResult> {
  if (!(await isWeeklyReportEnabled())) return { emailed: 0, skipped: true };

  const actor: Actor = { type: "SYSTEM", job: "acquisition.analytics.weekly-report", jobRunId };
  const input = await buildWeeklyInsightInput(actor, { lines: ALL_LINES, now });
  const { insight } = await generateWeeklyInsight(actor, input);

  const week = isoWeekKey(now);
  const title = `Weekly acquisition insight — ${input.weekLabel}`;
  const body = renderBody(insight);
  const emailed = new Set<string>();

  for (const role of ["MANAGER", "ADMIN"] as const) {
    const result = await notify({
      role,
      type: ANALYTICS_NOTIFICATION_TYPES.weeklyReport,
      title,
      body,
      link: "/acquisition/overview",
      channels: ["IN_APP", "EMAIL"],
      dedupeKey: `analytics.weekly-report:${week}`,
    });
    for (const id of result.emailedUserIds) emailed.add(id);
  }

  return { emailed: emailed.size, skipped: false };
}
