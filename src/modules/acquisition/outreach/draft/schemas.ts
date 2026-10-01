/**
 * Input and output schemas for the outreach drafting tasks (module spec §3.11). The input gathers
 * only what the model needs; untrusted finding evidence is wrapped by the SKILL.md (INV-24). Every
 * factual claim in the body cites a finding with a `[[f:<id>]]` marker (INV-5); citation
 * enforcement runs in `draft.ts` after generation.
 */

import { z } from "zod";

import { ChannelSchema, FindingSeveritySchema, MarketSchema, ServiceLineSchema } from "@/contracts/common";

export const DraftFindingSchema = z.object({
  id: z.string(),
  checkId: z.string(),
  severity: FindingSeveritySchema,
  claim: z.string(),
  evidence: z.string(),
  sourceUrl: z.string().nullable(),
});

export const OutreachDraftInputSchema = z.object({
  company: z.object({
    name: z.string(),
    country: z.string().nullable(),
    city: z.string().nullable(),
    industry: z.string().nullable(),
  }),
  contact: z.object({
    firstName: z.string().nullable(),
    role: z.string().nullable(),
  }),
  serviceLine: ServiceLineSchema,
  market: MarketSchema,
  findings: z.array(DraftFindingSchema).max(5),
  pitchAngle: z.object({
    id: z.string(),
    hook: z.string(),
    proofTags: z.array(z.string()),
  }),
  portfolio: z
    .array(
      z.object({
        id: z.string(),
        title: z.string(),
        description: z.string(),
        outcomeMetric: z.string().nullable(),
        url: z.string().nullable(),
      }),
    )
    .max(2),
  step: z.object({
    index: z.int().min(0),
    purpose: z.string(),
    channel: ChannelSchema,
    includeBookingLink: z.boolean(),
    isFirstTouch: z.boolean(),
  }),
  previousMessages: z.array(
    z.object({ stepIndex: z.int().nullable(), subject: z.string().nullable(), body: z.string() }),
  ),
  crossSell: z
    .object({ leadingLine: ServiceLineSchema, secondaryLines: z.array(ServiceLineSchema) })
    .nullable(),
  sender: z.object({ name: z.string(), title: z.string().nullable() }),
  bookingLink: z.string().nullable(),
});
export type OutreachDraftInput = z.infer<typeof OutreachDraftInputSchema>;

export const OutreachDraftOutputSchema = z.object({
  subject: z.string().nullable(),
  body: z.string().min(1),
  citedFindingIds: z.array(z.string()).default([]),
  angleId: z.string(),
  portfolioIds: z.array(z.string()).default([]),
  personalizationNotes: z.string().default(""),
});
export type OutreachDraftOutput = z.infer<typeof OutreachDraftOutputSchema>;

/** Streaming editor assist: a short instruction plus the current text (module spec §3.11). */
export const OutreachDraftEditInputSchema = z.object({
  channel: ChannelSchema,
  isFirstTouch: z.boolean(),
  instruction: z.string().min(1).max(400),
  subject: z.string().nullable(),
  body: z.string().min(1),
});
export type OutreachDraftEditInput = z.infer<typeof OutreachDraftEditInputSchema>;

export const OutreachDraftEditOutputSchema = z.object({
  subject: z.string().nullable(),
  body: z.string().min(1),
});
export type OutreachDraftEditOutput = z.infer<typeof OutreachDraftEditOutputSchema>;
