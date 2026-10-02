"use server";

/**
 * Server actions for the team & capacity admin screen. `@/platform/team` owns authorisation
 * (platform.team.update) and the MANAGER-can't-edit-admins rule. The what-if runs the pure throttle
 * rules on the server.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { AppError } from "@/lib/errors";
import { ok, err, type ActionResult } from "@/lib/result";
import { requireUser } from "@/platform/auth";
import { actorFromCurrentUser, getLineCapacity, getTeamProfile, updateTeamProfile } from "@/platform/team";
import { getActiveProfile } from "@/modules/acquisition/profiles";
import { ALL_SERVICE_LINES, computeThrottleMode, loadPercent } from "@/modules/acquisition/scoring";
import type { ServiceLine } from "@/contracts/common";

const LINES = ["WEB_DEVELOPMENT", "UI_UX_DESIGN", "GRAPHIC_DESIGN", "VIDEO_EDITING"] as const;
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

function fail(issues: unknown): AppError {
  return new AppError("VALIDATION_FAILED", "Please check the form and try again.", {
    details: { issues },
  });
}

const UpdateSchema = z.object({
  serviceLines: z.array(z.enum(LINES)).optional(),
  weeklyCapacity: z.number().int().min(0).max(40).optional(),
  canApprove: z.boolean().optional(),
  timezone: z.string().trim().min(3).max(64).optional(),
  workingHoursStart: z.string().regex(HHMM).optional(),
  workingHoursEnd: z.string().regex(HHMM).optional(),
  title: z.string().trim().max(80).nullable().optional(),
});

export interface TeamProfilePatch {
  serviceLines?: string[];
  weeklyCapacity?: number;
  canApprove?: boolean;
  timezone?: string;
  workingHoursStart?: string;
  workingHoursEnd?: string;
  title?: string | null;
}

export async function updateTeamProfileAction(
  userId: string,
  patch: TeamProfilePatch,
): Promise<ActionResult<{ ok: true }>> {
  try {
    const user = await requireUser();
    const parsed = UpdateSchema.safeParse(patch);
    if (!parsed.success) return err(fail(parsed.error.issues));
    await updateTeamProfile(actorFromCurrentUser(user), userId, parsed.data);
    revalidatePath("/admin/team");
    return ok({ ok: true });
  } catch (error) {
    return err(error);
  }
}

export interface WhatIfTransition {
  line: ServiceLine;
  from: "NORMAL" | "SLOW" | "PAUSED";
  to: "NORMAL" | "SLOW" | "PAUSED";
}

/** Server-computed: would changing one person's weekly capacity move any of their lines' throttle? */
export async function capacityWhatIfAction(
  userId: string,
  newCapacity: number,
): Promise<ActionResult<{ transitions: WhatIfTransition[] }>> {
  try {
    const user = await requireUser();
    const parsed = z
      .object({ userId: z.string().min(1), newCapacity: z.number().int().min(0).max(40) })
      .safeParse({ userId, newCapacity });
    if (!parsed.success) return err(fail(parsed.error.issues));

    const profile = await getTeamProfile(actorFromCurrentUser(user), parsed.data.userId);
    const delta = parsed.data.newCapacity - profile.weeklyCapacity;
    const lines = profile.serviceLines.filter((l) => ALL_SERVICE_LINES.includes(l));

    const transitions: WhatIfTransition[] = [];
    for (const line of lines) {
      const [{ capacity, load }, active] = await Promise.all([
        getLineCapacity(line),
        getActiveProfile(line).catch(() => null),
      ]);
      const thresholds = {
        slowAtPercent: active?.capacityPolicy.slowAtPercent ?? 70,
        pauseAtPercent: active?.capacityPolicy.pauseAtPercent ?? 100,
      };
      const from = computeThrottleMode(loadPercent(capacity, load), thresholds);
      const to = computeThrottleMode(loadPercent(capacity + delta, load), thresholds);
      if (from !== to) transitions.push({ line, from, to });
    }
    return ok({ transitions });
  } catch (error) {
    return err(error);
  }
}
