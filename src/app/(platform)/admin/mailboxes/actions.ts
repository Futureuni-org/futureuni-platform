"use server";

/**
 * Server actions for the mailboxes & sending-domains admin screen. The outreach module owns
 * authorisation (acquisition.mailbox.manage, acquisition.domain.checkDns) and auditing.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { AppError } from "@/lib/errors";
import { ok, err, type ActionResult } from "@/lib/result";
import { actorOf, requireUser } from "@/platform/auth";
import {
  addMailbox,
  checkDomainDns,
  updateMailbox,
  type DnsCheckResult,
} from "@/modules/acquisition/outreach";

function fail(issues: unknown): AppError {
  return new AppError("VALIDATION_FAILED", "Please check the form and try again.", {
    details: { issues },
  });
}

export async function checkDnsAction(domain: string): Promise<ActionResult<DnsCheckResult>> {
  try {
    const actor = actorOf(await requireUser());
    const parsed = z.object({ domain: z.string().trim().min(3).max(253) }).safeParse({ domain });
    if (!parsed.success) return err(fail(parsed.error.issues));
    const result = await checkDomainDns(actor, parsed.data.domain);
    revalidatePath("/admin/mailboxes");
    return ok(result);
  } catch (error) {
    return err(error);
  }
}

export async function setMailboxStatusAction(
  id: string,
  status: "ACTIVE" | "PAUSED",
): Promise<ActionResult<{ ok: true }>> {
  try {
    const actor = actorOf(await requireUser());
    await updateMailbox(actor, id, { status });
    revalidatePath("/admin/mailboxes");
    return ok({ ok: true });
  } catch (error) {
    return err(error);
  }
}

const CapsSchema = z.object({
  displayName: z.string().trim().min(1).max(120).optional(),
  dailyCapTarget: z.number().int().min(1).max(2000).optional(),
  warmupRampDays: z.number().int().min(0).max(90).optional(),
  sendWindowStart: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
  sendWindowEnd: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
});

export async function updateMailboxCapsAction(
  id: string,
  patch: z.input<typeof CapsSchema>,
): Promise<ActionResult<{ ok: true }>> {
  try {
    const actor = actorOf(await requireUser());
    const parsed = CapsSchema.safeParse(patch);
    if (!parsed.success) return err(fail(parsed.error.issues));
    const d = parsed.data;
    await updateMailbox(actor, id, {
      ...(d.displayName !== undefined ? { displayName: d.displayName } : {}),
      ...(d.dailyCapTarget !== undefined ? { dailyCapTarget: d.dailyCapTarget } : {}),
      ...(d.warmupRampDays !== undefined ? { warmupRampDays: d.warmupRampDays } : {}),
      ...(d.sendWindowStart !== undefined ? { sendWindowStart: d.sendWindowStart } : {}),
      ...(d.sendWindowEnd !== undefined ? { sendWindowEnd: d.sendWindowEnd } : {}),
    });
    revalidatePath("/admin/mailboxes");
    return ok({ ok: true });
  } catch (error) {
    return err(error);
  }
}

const AddSchema = z.object({
  address: z.email(),
  displayName: z.string().trim().min(1).max(120),
  sendingDomain: z.string().trim().min(3).max(253),
  provider: z.enum(["gmail-api", "smtp", "mock"]),
});

export async function addMailboxAction(
  input: z.input<typeof AddSchema>,
): Promise<ActionResult<{ id: string }>> {
  try {
    const actor = actorOf(await requireUser());
    const parsed = AddSchema.safeParse(input);
    if (!parsed.success) return err(fail(parsed.error.issues));
    const result = await addMailbox(actor, parsed.data);
    revalidatePath("/admin/mailboxes");
    return ok({ id: result.id });
  } catch (error) {
    return err(error);
  }
}
