/**
 * Input/output schemas for `acquisition.inbox-classify` (Phase 13, fast tier). The reply text is
 * untrusted content and reaches the model only inside a delimited data block the SKILL.md defines
 * (INV-24). The output is `ReplyClassificationSchema` from the records contract, stored field by
 * field on the `Reply` row.
 */

import { z } from "zod";

import { MarketSchema, ServiceLineSchema } from "@/contracts/common";
import { ReplyClassificationSchema } from "@/contracts/acquisition-records";

export const InboxClassifyInputSchema = z.object({
  serviceLine: ServiceLineSchema,
  market: MarketSchema,
  /** Our most recent outbound message in the thread, for context (may be null). */
  originalMessage: z
    .object({ subject: z.string().max(300).nullable(), text: z.string().max(8_000) })
    .nullable(),
  reply: z.object({
    fromName: z.string().max(200).nullable(),
    subject: z.string().max(500).nullable(),
    text: z.string().min(1).max(12_000),
    /** The reply's received date (ISO), used to resolve relative follow-up phrases. */
    receivedAt: z.string(),
    /** The recipient's IANA timezone, used to resolve relative follow-up dates. */
    recipientTimezone: z.string().max(60),
  }),
});
export type InboxClassifyInput = z.infer<typeof InboxClassifyInputSchema>;

export const InboxClassifyOutputSchema = ReplyClassificationSchema;
export type InboxClassifyOutput = z.infer<typeof InboxClassifyOutputSchema>;
