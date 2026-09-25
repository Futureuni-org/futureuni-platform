# Contract: Acquisition records (typed JSON columns)

| | |
|---|---|
| Module | `src/contracts/acquisition-records.ts` |
| Types written by | Phase 2 (validates these JSON columns on write; factories and seed use them) |
| Implemented by | Phase 13 (reply records), Phase 14 (meetings, proposals, handoff) |
| Consumers | 16 (lead detail, inbox, proposals), 17 (analytics), 19 (orchestration), future modules subscribing to `deal.won` / `handoff.created` |

## 1. Purpose

Some acquisition rows store structured JSON: a meeting's pre-call brief and summary, a proposal's package selection and prose sections, a handoff snapshot, and what the inbox extracted from a reply and did about it. This file fixes those shapes, so the writer phase (13 or 14) and the reader phases (16, 17, 19) agree without talking.

AI task **output** schemas belong to the task's `tasks.ts` in the owning phase. Where a task output is stored as-is (`PrecallBrief`, `MeetingSummary`), the stored shape is defined here, and the task's output schema must equal it.

Other typed JSON shapes live with their interfaces:
- `ScoreReason`, `ServiceLineProfile`: [service-line-profile.md](service-line-profile.md)
- `Contactability`, `CompanySocials`, `FieldSources`, `TechHints`, `VerifierFlags`: [enrichment.md](enrichment.md)
- `FindingEvidence`: [audit-agent.md](audit-agent.md)
- `SearchSpec`, `SearchRunCounts`, `SearchRunSourceResult`, `CsvAttestation`, `CrossLineHint`: [source-adapter.md](source-adapter.md)
- `AssistedOutcome`: [outreach-channel.md](outreach-channel.md)
- `JobCounts`, `JobProgress`: [jobs.md](jobs.md)
- `AiContentLog`: [ai-service.md](ai-service.md)
- `NotificationData`: [events.md](events.md)

## 2. Types and schemas

```ts
// src/contracts/acquisition-records.ts
import { z } from "zod";
import {
  IdSchema, Iso8601Schema, IsoDateSchema, CurrencySchema, MinorUnitsSchema, ServiceLineSchema, MarketSchema,
  ReplyClassSchema, SlugIdSchema, EmailStatusSchema,
} from "./common";

// ---------- Replies (Reply.referral, Reply.actionsTaken) ----------
export const ReplyReferralSchema = z.object({
  name: z.string().max(120).nullable(),
  email: z.email().nullable(),
  role: z.string().max(120).nullable(),
  contactId: IdSchema.optional(),                   // set once the referral is verified and upserted (Phase 13)
  verification: EmailStatusSchema.optional(),
});
export type ReplyReferral = z.infer<typeof ReplyReferralSchema>;

export const ReplyActionsTakenSchema = z.array(z.object({
  action: z.enum([
    "SEQUENCE_STOPPED", "SEQUENCE_PAUSED", "SUPPRESSED", "NURTURED", "STATUS_CHANGED", "REFERRAL_PROPOSED",
    "BOUNCE_RECORDED", "OWNER_NOTIFIED", "DRAFT_CREATED", "SLA_STARTED", "RECLASSIFIED",
  ]),
  at: Iso8601Schema,
  detail: z.string().max(300).optional(),            // plain language, e.g. "Paused until 14 Oct (out of office)"
  refId: IdSchema.optional(),                         // enrollment, suppression, message or lead event id
})).max(50);
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
  summary: z.string().max(160),                       // one line for the inbox list
});

// ---------- Meetings (Meeting.precallBrief, Meeting.summary) ----------
export const PrecallBriefSchema = z.object({
  summary: z.string().max(1200),
  whatTheyCareAbout: z.array(z.string().max(200)).max(6),
  likelyNeeds: z.array(z.string().max(200)).max(6),
  suggestedQuestions: z.array(z.string().max(200)).min(5).max(8),
  suggestedPackage: z.object({ packageId: SlugIdSchema, why: z.string().max(300) }).nullable(),
  priceRangeToDiscuss: z.object({ minMinor: MinorUnitsSchema, maxMinor: MinorUnitsSchema, currency: CurrencySchema }).nullable(),  // must come from the profile
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
  nextSteps: z.array(z.object({ action: z.string().max(200), owner: z.string().max(120), due: IsoDateSchema.nullable() })).max(10),
  recommendedPackageIds: z.array(SlugIdSchema).max(3),
});
export type MeetingSummary = z.infer<typeof MeetingSummarySchema>;

// ---------- Proposals (Proposal.packages, Proposal.sections) ----------
/** Selected profile packages with the price chosen inside the package range (prices computed in code; INV-17). */
export const ProposalPackageSelectionSchema = z.array(z.object({
  packageId: SlugIdSchema,
  name: z.string().max(80),                           // snapshot of the package name at the time
  quantity: z.int().min(1).max(100),
  unitPriceMinor: MinorUnitsSchema,
  currency: CurrencySchema,
  withinRange: z.boolean(),                           // false → exception approval required
})).min(1).max(10);
export type ProposalPackageSelection = z.infer<typeof ProposalPackageSelectionSchema>;

/** Prose per PDF section, written by acquisition.pipeline-proposal-draft; numbers must equal supplied figures. */
export const ProposalSectionsSchema = z.object({
  understanding: z.string().max(3000),                // cites findings in plain language (markers stripped for the PDF)
  solution: z.string().max(3000),
  scope: z.string().max(3000),
  timeline: z.string().max(1500),
  investmentIntro: z.string().max(800),               // the investment table itself is rendered from computed figures
  whyFutureuni: z.string().max(2000),                 // non-placeholder portfolio items only (INV-19)
  terms: z.string().max(2000),
  nextSteps: z.string().max(1000),
});
export type ProposalSections = z.infer<typeof ProposalSectionsSchema>;

// ---------- Handoff (Handoff.content) ----------
export const HandoffContentSchema = z.object({
  company: z.object({ id: IdSchema, name: z.string(), website: z.string().nullable(), country: z.string().nullable(), city: z.string().nullable() }),
  contacts: z.array(z.object({ id: IdSchema, name: z.string().nullable(), role: z.string().nullable(), email: z.email().nullable(), phone: z.string().nullable() })).max(10),
  market: MarketSchema,
  services: z.array(ServiceLineSchema).min(1),
  scope: z.array(z.string().max(300)).max(30),        // deliverables from the accepted proposal
  timeline: z.object({ startDate: IsoDateSchema.nullable(), notes: z.string().max(500) }),
  value: z.object({ amountMinor: MinorUnitsSchema, currency: CurrencySchema }),
  paymentNotes: z.string().max(1000),
  keyFindings: z.array(z.object({ findingId: IdSchema, claim: z.string().max(240) })).max(10),
  meetingSummaries: z.array(z.object({ meetingId: IdSchema, summary: z.string().max(1500) })).max(10),
  files: z.array(z.object({ fileObjectId: IdSchema, label: z.string().max(80) })).max(10),
  proposalId: IdSchema.nullable(),
  snapshotAt: Iso8601Schema,
});
export type HandoffContent = z.infer<typeof HandoffContentSchema>;
```

## 3. Rules

1. **The writer validates** each JSON column with its schema before writing it. Readers may parse defensively and show an error state rather than crash.
2. **Personal data in these records** (contacts in `HandoffContent`, names in `ReplyReferral`, meeting transcripts elsewhere) falls under the retention purge and data-subject deletion (INV-10). The Phase 9 anonymiser knows these paths.
3. **Money in `PrecallBrief.priceRangeToDiscuss` and `ProposalPackageSelection`** comes only from the active profile's pricing for the lead's market. The model never invents a figure (INV-17). Amounts are integer minor units (INV-11).
4. **`citedFindingIds` and `keyFindings`** reference non-dismissed findings of the same lead (INV-18).
5. **`HandoffContent` is an immutable snapshot** taken when the deal is won. Later edits to the company or proposal don't change it, and a re-export uses the snapshot.
6. **`ReplyActionsTaken` is append-only** for a reply. Reclassification appends `RECLASSIFIED` plus the new actions and never deletes earlier entries.

## 4. Worked example

```ts
PrecallBriefSchema.parse({
  summary: "Lagos restaurant group with two branches; enquiries come through Instagram DMs and phone.",
  whatTheyCareAbout: ["More online orders", "Less time answering DMs"],
  likelyNeeds: ["A fast mobile site with a menu and ordering link"],
  suggestedQuestions: ["How do most customers order today?", "Who updates your menu?", "What does a busy Friday look like?",
                       "Have you had a website before?", "What would success look like in three months?"],
  suggestedPackage: { packageId: "starter_site", why: "No website today; menu and ordering are the core needs." },
  priceRangeToDiscuss: { minMinor: 45_000_000, maxMinor: 90_000_000, currency: "NGN" },
  risks: ["Owner is the only decision maker and is busy at weekends"],
  citedFindingIds: ["cm1fnd00000000000000000001"],
});
```

## 5. Invalid example (Phase 2 test)

```ts
ProposalPackageSelectionSchema.safeParse([{ packageId: "starter-site", name: "Starter", quantity: 1, unitPriceMinor: 4500000.5, currency: "NGN", withinRange: true }]);
// → fails: [0,"packageId"] "snake_case id"; [0,"unitPriceMinor"] expected int (money is integer minor units)
```
