/**
 * `platform.send-email` job body: render the template, hand it to the sender, record the delivery.
 */

import "server-only";

import type { JobResult } from "@/contracts/jobs";
import { env } from "@/env";
import { AppError } from "@/lib/errors";
import { db } from "@/platform/db";

import { EMAIL_TEMPLATES, type EmailTemplateId } from "@/emails/index";

import { getEmailSender } from "./adapter";

const FALLBACK_FROM = "FUTUREUNI Platform <notifications@futureuni.example>";

export async function deliverPlatformEmail(input: {
  to: string;
  template: string;
  props: Record<string, unknown>;
  dedupeKey: string;
}): Promise<JobResult> {
  const templateId = input.template as EmailTemplateId;
  if (!Object.prototype.hasOwnProperty.call(EMAIL_TEMPLATES, templateId)) {
    throw new AppError("VALIDATION_FAILED", `Unknown email template: ${input.template}`);
  }
  const template = EMAIL_TEMPLATES[templateId];
  const from = env.EMAIL_FROM ?? FALLBACK_FROM;
  const replyTo = env.EMAIL_REPLY_TO;

  const existing = await db.emailDelivery.findUnique({ where: { dedupeKey: input.dedupeKey } });
  if (existing !== null && existing.status === "SENT") {
    return { counts: { skipped: 1 } };
  }

  const rendered = await (template.render as (props: Record<string, unknown>) => Promise<{ subject: string; html: string; text: string }>)(input.props);
  const sender = getEmailSender();
  const delivery = await db.emailDelivery.upsert({
    where: { dedupeKey: input.dedupeKey },
    create: {
      to: input.to,
      template: input.template,
      subject: rendered.subject,
      status: "QUEUED",
      provider: env.MOCKS ? "mock" : "resend",
      dedupeKey: input.dedupeKey,
    },
    update: { status: "QUEUED" },
    select: { id: true },
  });

  try {
    const result = await sender.send({
      to: input.to,
      from,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      ...(replyTo === undefined ? {} : { replyTo }),
    });
    await db.emailDelivery.update({
      where: { id: delivery.id },
      data: { status: "SENT", providerMessageId: result.providerMessageId, sentAt: new Date(), error: null },
    });
    return { counts: { sent: 1 } };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db.emailDelivery.update({
      where: { id: delivery.id },
      data: { status: "FAILED", error: message.slice(0, 500) },
    });
    throw error;
  }
}
