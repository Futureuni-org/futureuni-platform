/**
 * Input/output schemas for `acquisition.inbox-draft-reply` (Phase 13, balanced tier). The thread and
 * findings reach the model only inside delimited data blocks (INV-24). Every personalised claim in
 * the body carries a `[[f:<findingId>]]` / `[[s:<signalId>]]` marker validated against the supplied
 * evidence after generation (INV-5); the draft never commits to prices outside the profile ranges,
 * timelines outside the catalogue, or capabilities FUTUREUNI does not offer.
 */

import { z } from "zod";

import { CurrencySchema, MarketSchema, MinorUnitsSchema, ReplyClassSchema, ServiceLineSchema } from "@/contracts/common";

export const InboxDraftReplyInputSchema = z.object({
  serviceLine: ServiceLineSchema,
  market: MarketSchema,
  classification: ReplyClassSchema,
  ownerName: z.string().max(200),
  leadBrief: z.string().max(2_000).nullable(),
  /** The conversation so far, oldest first: our messages and their replies. */
  thread: z
    .array(
      z.object({
        direction: z.enum(["OUTBOUND", "INBOUND"]),
        subject: z.string().max(500).nullable(),
        text: z.string().max(8_000),
      }),
    )
    .max(20),
  objectionSummary: z.string().max(400).nullable(),
  questions: z.array(z.string().max(300)).max(10),
  /** Non-dismissed findings available to cite (INV-18); each id may appear as a `[[f:id]]` marker. */
  findings: z
    .array(z.object({ id: z.string(), label: z.string().max(200), detail: z.string().max(600), sourceUrl: z.string().nullable() }))
    .max(20),
  /** Packages and price ranges from the active profile (INV-17); the draft never invents figures. */
  packages: z
    .array(
      z.object({
        id: z.string(),
        name: z.string().max(120),
        minMinor: MinorUnitsSchema,
        maxMinor: MinorUnitsSchema,
        currency: CurrencySchema,
      }),
    )
    .max(20),
  bookingLink: z.string().nullable(),
});
export type InboxDraftReplyInput = z.infer<typeof InboxDraftReplyInputSchema>;

export const InboxDraftReplyOutputSchema = z.object({
  subject: z.string().max(200).nullable(),
  body: z.string().min(1).max(8_000),
  citedFindingIds: z.array(z.string()).max(20),
  needsPricingApproval: z.boolean(),
  notes: z.string().max(600),
});
export type InboxDraftReplyOutput = z.infer<typeof InboxDraftReplyOutputSchema>;
