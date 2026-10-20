"use server";

/**
 * Server actions for the mailboxes & sending-domains admin screen. The outreach module owns
 * authorisation (acquisition.mailbox.manage, acquisition.domain.checkDns) and auditing.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { AppError } from "@/lib/errors";
import { ok, err, type ActionResult } from "@/lib/result";
import { ProviderIdSchema } from "@/contracts/common";
import { actorOf, requireUser } from "@/platform/auth";
import { saveCredential, testCredential } from "@/platform/credentials";
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
  sendWindowStart: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .optional(),
  sendWindowEnd: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .optional(),
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

const MailboxIdSchema = z.string().regex(/^[a-z0-9]{20,32}$/, "Invalid mailbox id.");

const SmtpCredentialSchema = z.object({
  mailboxId: MailboxIdSchema,
  host: z.string().trim().min(1).max(255),
  port: z.coerce.number().int().min(1).max(65535),
  user: z.string().trim().min(1).max(320),
  pass: z.string().min(1).max(1024),
  secure: z.boolean().optional(),
});

/**
 * Stores an outreach mailbox's SMTP credentials in the vault under `outreach-mailbox:<id>` (INV-21).
 * The password is encrypted at rest and never returned; only the masked hint and status come back.
 */
export async function saveMailboxSmtpAction(
  input: z.input<typeof SmtpCredentialSchema>,
): Promise<ActionResult<{ maskedHint: string | null; status: string }>> {
  try {
    const actor = actorOf(await requireUser());
    const parsed = SmtpCredentialSchema.safeParse(input);
    if (!parsed.success) return err(fail(parsed.error.issues));
    const { mailboxId, secure, ...rest } = parsed.data;
    const providerId = ProviderIdSchema.parse(`outreach-mailbox:${mailboxId}`);
    const payload = { ...rest, ...(secure === undefined ? {} : { secure }) };
    const status = await saveCredential(actor, providerId, payload);
    revalidatePath("/admin/mailboxes");
    return ok({ maskedHint: status.maskedHint, status: status.status });
  } catch (error) {
    return err(error);
  }
}

/** Opens a real SMTP connection with the stored credentials and records the result. */
export async function testMailboxSmtpAction(
  mailboxId: string,
): Promise<ActionResult<{ status: string; lastError: string | null }>> {
  try {
    const actor = actorOf(await requireUser());
    const parsed = MailboxIdSchema.safeParse(mailboxId);
    if (!parsed.success) return err(fail(parsed.error.issues));
    const providerId = ProviderIdSchema.parse(`outreach-mailbox:${parsed.data}`);
    const status = await testCredential(actor, providerId);
    revalidatePath("/admin/mailboxes");
    return ok({ status: status.status, lastError: status.lastError });
  } catch (error) {
    return err(error);
  }
}
