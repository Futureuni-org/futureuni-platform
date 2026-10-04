"use server";

/**
 * Cron preview for the saved-search editor: validate an expression and return the next few run
 * times in the chosen timezone, plus a short human description. Uses `croner` (the same library the
 * platform dispatcher uses) so the preview matches real scheduling.
 */

import { Cron } from "croner";

import { ok, err, type ActionResult } from "@/lib/result";
import { AppError } from "@/lib/errors";
import { requireUser } from "@/platform/auth";

export interface CronPreview {
  valid: boolean;
  description: string;
  nextRuns: string[];
}

const PRESET_DESCRIPTIONS: Record<string, string> = {
  "0 9 * * *": "Every day at 09:00",
  "0 9 * * 1-5": "Weekdays at 09:00",
  "0 */6 * * *": "Every 6 hours",
  "0 9 * * 1": "Every Monday at 09:00",
};

export async function previewCronAction(
  cron: string,
  timezone: string,
): Promise<ActionResult<CronPreview>> {
  try {
    await requireUser();
    const trimmed = cron.trim();
    if (trimmed.length === 0) {
      return err(new AppError("VALIDATION_FAILED", "Enter a schedule."));
    }
    let nextRuns: string[];
    try {
      const schedule = new Cron(trimmed, { timezone });
      nextRuns = schedule.nextRuns(3).map((d) => d.toISOString());
    } catch {
      return ok({ valid: false, description: "That schedule isn't valid.", nextRuns: [] });
    }
    const description = PRESET_DESCRIPTIONS[trimmed] ?? `Custom schedule (${trimmed})`;
    return ok({ valid: true, description, nextRuns });
  } catch (error) {
    return err(error);
  }
}
