/**
 * Contract: acquisition records, the typed JSON columns of the inbox and pipeline
 * (docs/contracts/acquisition-records.md). Written by Phase 13 (replies) and Phase 14 (meetings,
 * proposals, handoff); read by Phases 16, 17 and 19.
 */

import { z } from "zod";

import {
  CurrencySchema,
  EmailStatusSchema,
  IdSchema,
  Iso8601Schema,
  IsoDateSchema,
  MarketSchema,
  MinorUnitsSchema,
  ReplyClassSchema,
  ServiceLineSchema,
  SlugIdSchema,
} from "./common";

// ---------- Replies (Reply.referral, Reply.actionsTaken) ----------
export const ReplyReferralSchema = z.object({
  name: z.string().max(120).nullable(),
  email: z.email().nullable(),
  role: z.string().max(120).nullable(),
  contactId: IdSchema.optional(), // set once the referral is verified and upserted (Phase 13)
  verification: EmailStatusSchema.optional(),
});
export type ReplyReferral = z.infer<typeof ReplyReferralSchema>;

export const ReplyActionsTakenSchema = z
  .array(
    z.object({
      action: z.enum([
        "SEQUENCE_STOPPED",
        "SEQUENCE_PAUSED",
        "SUPPRESSED",
        "NURTURED",
        "STATUS_CHANGED",
        "REFERRAL_PROPOSED",
        "BOUNCE_RECORDED",
        "OWNER_NOTIFIED",
        "DRAFT_CREATED",
        "SLA_STARTED",
        "RECLASSIFIED",
      ]),
      at: Iso8601Schema,
      detail: z.string().max(300).optional(), // plain language, e.g. "Paused until 14 Oct (out of office)"
      refId: IdSchema.optional(), // enrollment, suppression, message or lead event id
    }),
  )
  .max(50);
export type ReplyActionsTaken = z.infer<typeof ReplyActionsTakenSchema>;

/** Output of acquisition.inbox-classify, stored field by field on Reply (Phase 13). Reproduced here for readers. */
export const ReplyClassificationSchema = z.object({
  classification: ReplyClassSchema,
  confidence: z.number().min(0).max(1),
  followUpDate: IsoDateSchema.nullable(),
  referral: ReplyReferralSchema.pick({ name: true, email: true, role: true }).nullable(),
  objectionSummary: z.string().max(400).nullable(),
  questions: z.array(z.string().max(300)).max(10),
  sentiment: z.enum(["positive", "neutral", "negative"]),
  language: z.string().max(20),
  summary: z.string().max(160), // one line for the inbox list
});

// ---------- Meetings (Meeting.precallBrief, Meeting.summary) ----------
export const PrecallBriefSchema = z.object({
  summary: z.string().max(1200),
  whatTheyCareAbout: z.array(z.string().max(200)).max(6),
  likelyNeeds: z.array(z.string().max(200)).max(6),
  suggestedQuestions: z.array(z.string().max(200)).min(5).max(8),
  suggestedPackage: z.object({ packageId: SlugIdSchema, why: z.string().max(300) }).nullable(),
  priceRangeToDiscuss: z
    .object({ minMinor: MinorUnitsSchema, maxMinor: MinorUnitsSchema, currency: CurrencySchema })
    .nullable(), // must come from the profile
  risks: z.array(z.string().max(200)).max(6),
  citedFindingIds: z.array(IdSchema),
});
export type PrecallBrief = z.infer<typeof PrecallBriefSchema>;

export const MeetingSummarySchema = z.object({
  summary: z.string().max(1500),
  needs: z.array(z.string().max(200)).max(10),
  budgetSignals: z.array(z.string().max(200)).max(6),
  decisionMakers: z.array(z.string().max(160)).max(6),
  objections: z.array(z.string().max(200)).max(6),
  nextSteps: z
    .array(
      z.object({
        action: z.string().max(200),
        owner: z.string().max(120),
        due: IsoDateSchema.nullable(),
      }),
    )
    .max(10),
  recommendedPackageIds: z.array(SlugIdSchema).max(3),
});
export type MeetingSummary = z.infer<typeof MeetingSummarySchema>;

// ---------- Proposals (Proposal.packages, Proposal.sections) ----------
/** Selected profile packages with the price chosen inside the package range (prices computed in code; INV-17). */
export const ProposalPackageSelectionSchema = z
  .array(
    z.object({
      packageId: SlugIdSchema,
      name: z.string().max(80), // snapshot of the package name at the time
      quantity: z.int().min(1).max(100),
      unitPriceMinor: MinorUnitsSchema,
      currency: CurrencySchema,
      withinRange: z.boolean(), // false → exception approval required
    }),
  )
  .min(1)
  .max(10);
export type ProposalPackageSelection = z.infer<typeof ProposalPackageSelectionSchema>;

/** Prose per PDF section, written by acquisition.pipeline-proposal-draft; numbers must equal supplied figures. */
export const ProposalSectionsSchema = z.object({
  understanding: z.string().max(3000), // cites findings in plain language (markers stripped for the PDF)
  solution: z.string().max(3000),
  scope: z.string().max(3000),
  timeline: z.string().max(1500),
  investmentIntro: z.string().max(800), // the investment table itself is rendered from computed figures
  whyFutureuni: z.string().max(2000), // non-placeholder portfolio items only (INV-19)
  terms: z.string().max(2000),
  nextSteps: z.string().max(1000),
});
export type ProposalSections = z.infer<typeof ProposalSectionsSchema>;

// ---------- Handoff (Handoff.content) ----------
export const HandoffContentSchema = z.object({
  company: z.object({
    id: IdSchema,
    name: z.string(),
    website: z.string().nullable(),
    country: z.string().nullable(),
    city: z.string().nullable(),
  }),
  contacts: z
    .array(
      z.object({
        id: IdSchema,
        name: z.string().nullable(),
        role: z.string().nullable(),
        email: z.email().nullable(),
        phone: z.string().nullable(),
      }),
    )
    .max(10),
  market: MarketSchema,
  services: z.array(ServiceLineSchema).min(1),
  scope: z.array(z.string().max(300)).max(30), // deliverables from the accepted proposal
  timeline: z.object({ startDate: IsoDateSchema.nullable(), notes: z.string().max(500) }),
  value: z.object({ amountMinor: MinorUnitsSchema, currency: CurrencySchema }),
  paymentNotes: z.string().max(1000),
  keyFindings: z.array(z.object({ findingId: IdSchema, claim: z.string().max(240) })).max(10),
  meetingSummaries: z
    .array(z.object({ meetingId: IdSchema, summary: z.string().max(1500) }))
    .max(10),
  files: z.array(z.object({ fileObjectId: IdSchema, label: z.string().max(80) })).max(10),
  proposalId: IdSchema.nullable(),
  snapshotAt: Iso8601Schema,
});
export type HandoffContent = z.infer<typeof HandoffContentSchema>;
