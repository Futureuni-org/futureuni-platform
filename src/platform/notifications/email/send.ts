/**
 * `sendEmail({ to, template, props })` — Phase 6.
 *
 * `SEAM-AUTH-EMAIL` wires here at merge. Sending is asynchronous: this function enqueues a
 * `platform.send-email` job with a stable `dedupeKey` so a retried enqueue never sends twice.
 */

import "server-only";

import type { EMAIL_TEMPLATES, EmailTemplateId } from "@/emails/index";

export interface SendEmailInput<Id extends EmailTemplateId = EmailTemplateId> {
  to: string;
  template: Id;
  props: EmailTemplateProps<Id>;
  dedupeKey?: string;
}

export type EmailTemplateProps<Id extends EmailTemplateId> =
  (typeof EMAIL_TEMPLATES)[Id] extends { defaultProps: infer P } ? P : Record<string, unknown>;

export async function sendEmail<Id extends EmailTemplateId>(input: SendEmailInput<Id>): Promise<{ jobRunId: string }> {
  const templateId: EmailTemplateId = input.template;
  const { enqueueJob } = await import("@/platform/jobs/enqueue");
  const dedupe = input.dedupeKey ?? `${templateId}:${input.to}:${Date.now().toString(36)}`;
  const result = await enqueueJob(
    "platform.send-email",
    { to: input.to, template: templateId, props: input.props, dedupeKey: dedupe },
    { actor: { type: "SYSTEM", job: "platform.notifications.email" } },
  );
  return { jobRunId: result.jobRunId };
}
