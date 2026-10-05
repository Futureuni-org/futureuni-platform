import "server-only";

/**
 * The "Pipeline value" home-widget service (Phase 19): open value per currency across what the user
 * may see, plus the count of their own meetings today. Scope follows the user's role — ADMIN and
 * MANAGER see every line, a SERVICE_LEAD their lines, a MEMBER their own leads in their lines — so
 * the widget and the pipeline board agree. "Today" is the UTC calendar day of `now` (a dashboard
 * approximation; WAT is UTC+1).
 */

import { loadSubjectFromUserId } from "@/platform/auth";
import type { Clock, Currency } from "@/contracts/common";

import {
  countMeetingsInRange,
  sumOpenProposalValue,
  type PipelineValueScope,
} from "./widget.repo";

export interface PipelineWidgetData {
  openByCurrency: Partial<Record<Currency, number>>;
  meetingsToday: number;
}

function utcDayRange(now: Date): { start: Date; end: Date } {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

export async function getPipelineWidgetData(
  userId: string,
  clock: Clock,
): Promise<PipelineWidgetData> {
  const subject = await loadSubjectFromUserId(userId);
  if (subject?.status !== "ACTIVE") {
    return { openByCurrency: {}, meetingsToday: 0 };
  }
  const seesAll = subject.role === "ADMIN" || subject.role === "MANAGER";
  const scope: PipelineValueScope = seesAll
    ? {}
    : {
        serviceLines: subject.serviceLines,
        ...(subject.role === "MEMBER" ? { ownerId: userId } : {}),
      };
  // A line-scoped user with no lines sees nothing.
  if (!seesAll && subject.serviceLines.length === 0) {
    return { openByCurrency: {}, meetingsToday: 0 };
  }
  const { start, end } = utcDayRange(clock.now());
  const [openByCurrency, meetingsToday] = await Promise.all([
    sumOpenProposalValue(scope),
    countMeetingsInRange(userId, start, end),
  ]);
  return { openByCurrency, meetingsToday };
}
