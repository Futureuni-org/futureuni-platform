"use server";

/**
 * Budget and model-tier settings for the AI-usage screen. `setSetting` enforces
 * platform.aiBudget.update and validates the full object against its Zod schema.
 */

import { revalidatePath } from "next/cache";

import { ok, err, type ActionResult } from "@/lib/result";
import { actorOf, requireUser } from "@/platform/auth";
import { setSetting } from "@/platform/settings";

export async function updateAiBudgetsAction(budgets: unknown): Promise<ActionResult<{ ok: true }>> {
  try {
    const actor = actorOf(await requireUser());
    await setSetting(actor, "ai.budgets", budgets, {});
    revalidatePath("/admin/ai-usage");
    return ok({ ok: true });
  } catch (error) {
    return err(error);
  }
}

export async function updateModelTiersAction(tiers: unknown): Promise<ActionResult<{ ok: true }>> {
  try {
    const actor = actorOf(await requireUser());
    await setSetting(actor, "ai.modelTiers", tiers, {});
    revalidatePath("/admin/ai-usage");
    return ok({ ok: true });
  } catch (error) {
    return err(error);
  }
}
