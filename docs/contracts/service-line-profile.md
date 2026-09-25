# Contract: Service-line profile

| | |
|---|---|
| Module | `src/contracts/service-line-profile.ts` |
| Types written by | Phase 2 (and the seeded version-1 rows) |
| Implemented by | Phase 7 (`@/modules/acquisition/profiles`: defaults as code, services, validation, versioning) |
| Consumers | 8 (sources, keywords), 9 (contact role priorities, via SEAM-PROFILE), 10 (audits), 11 (scoring, disqualifiers, capacity policy), 12 (pitch angles, portfolio, sequences, approval mode), 13 (objection guidance via references), 14 (pricing packages), 15 (search defaults), 18 (profile editor), 19 |
| Storage | `ServiceLineProfileVersion.profile` (JSON), validated with `ServiceLineProfileSchema` on every write (INV-16) |

## 1. Purpose

A profile tells the acquisition engine how FUTUREUNI sells one service line:
- which signals matter, and where to find them in each market
- which audits to run and how to score them
- what to say, what proof to show and what it costs
- which sequence to run, when to disqualify and who owns the line

The engine reads profiles and never hardcodes line-specific behaviour. A fifth line is a new profile, not new code (ADR-008).

## 2. Types and schemas

```ts
// src/contracts/service-line-profile.ts
import { z } from "zod";
import {
  ServiceLineSchema, MarketSchema, CurrencySchema, RoleSchema, ChannelSchema, ApprovalModeSchema, IdSchema,
  SlugIdSchema, HttpUrlSchema, MinorUnitsSchema, FindingSeveritySchema, MARKET_CURRENCIES,
  type Market, type LegalForm, type CompanySizeRange, type WebsiteKind, type EmailStatus, type EmailType,
  type WhatsAppStatus, type ContactSeniority, type FindingSeverity,
} from "./common";
import type { EmailVerdict } from "./enrichment";
import { SourceAdapterIdSchema } from "./source-adapter";
import { AuditAgentIdSchema, AuditCheckIdSchema } from "./audit-agent";

// ---------- Conditions (used by scoring rules and disqualifiers) ----------
// Stored as structured JSON (an AST), so no free-text parser is needed and the Phase 18 rule builder edits it directly.
// Canonical text form (for display, diffs and the Advanced JSON view) is shown next to each atom.

export const ConditionFieldSchema = z.enum([
  "market",                          // Market                 market == NIGERIA
  "country",                         // CountryCode            country in [GB, IE]
  "company.legalForm",               // LegalForm              company.legalForm in [LIMITED, LLP]
  "company.sizeRange",               // CompanySizeRange (ordered SOLO < … < SIZE_1000_PLUS; UNKNOWN never matches >,<)
  "company.websiteKind",             // WebsiteKind            company.websiteKind == SOCIAL_ONLY
  "company.hasWebsite",              // boolean                company.hasWebsite == false
  "company.industry",                // string (normalised lower-case)
  "company.isActiveClient",          // boolean
  "company.copyrightYear",           // int (null never matches)
  "contact.primary.exists",          // boolean
  "contact.primary.emailStatus",     // EmailStatus            contact.primary.emailStatus == VALID
  "contact.primary.emailType",       // EmailType              contact.primary.emailType == ROLE
  "contact.primary.whatsappStatus",  // WhatsAppStatus
  "contact.primary.seniority",       // ContactSeniority        contact.primary.seniority in [OWNER, EXEC]
  "contactability.email",            // "ALLOWED" | "CONSENT_REQUIRED" | "REVIEW" | "BLOCKED"
  "contactability.hasAssistedChannel", // boolean (WhatsApp, LinkedIn or phone allowed)
  "signal.count",                    // int: signals for this lead's line
  "finding.pitchableCount",          // int: non-dismissed pitchable findings
]);
export type ConditionField = z.infer<typeof ConditionFieldSchema>;

const scalar = z.union([z.string().max(80), z.int(), z.boolean()]);
export const ConditionAtomSchema = z.discriminatedUnion("kind", [
  // signal:no_website            |  NOT signal:no_website
  z.object({ kind: z.literal("signal"), signalId: SlugIdSchema, negate: z.boolean().default(false) }),
  // finding.severity>=HIGH:web.pagespeed_mobile   |   finding.present:web.ssl
  z.object({
    kind: z.literal("finding"), checkId: AuditCheckIdSchema,
    minSeverity: FindingSeveritySchema.optional(),     // omitted = any non-dismissed finding for the check
    pitchableOnly: z.boolean().default(false),
    negate: z.boolean().default(false),
  }),
  // company.legalForm in [LIMITED, LLP]   |   contact.primary.emailStatus == VALID   |   signal.count >= 2
  z.object({
    kind: z.literal("field"), field: ConditionFieldSchema,
    op: z.enum(["eq", "neq", "in", "notIn", "gt", "gte", "lt", "lte"]),
    value: z.union([scalar, z.array(scalar).min(1).max(20)]),
  }),
]);
export type ConditionAtom = z.infer<typeof ConditionAtomSchema>;
/** All atoms must hold (AND). Use separate rules for OR. Max 5 atoms keeps rules explainable. */
export const ConditionSchema = z.object({ all: z.array(ConditionAtomSchema).min(1).max(5) });
export type Condition = z.infer<typeof ConditionSchema>;

/** The flattened facts a condition is evaluated against (built by Phase 11; pure evaluation, no I/O). */
export type ScoringFacts = {
  market: Market; country: string | null;
  company: { legalForm: LegalForm; sizeRange: CompanySizeRange; websiteKind: WebsiteKind; hasWebsite: boolean; industry: string | null; isActiveClient: boolean; copyrightYear: number | null };
  contact: { primary: { exists: boolean; emailStatus: EmailStatus | null; emailType: EmailType | null; whatsappStatus: WhatsAppStatus | null; seniority: ContactSeniority | null } };
  contactability: { email: EmailVerdict; hasAssistedChannel: boolean };
  signals: Array<{ id: string; signalType: string }>;
  findings: Array<{ id: string; checkId: string; severity: FindingSeverity; pitchable: boolean; dismissed: false }>;
};

// ---------- Profile parts ----------
export const SignalDefinitionSchema = z.object({
  id: SlugIdSchema,                                  // "no_website"; read-only once published
  label: z.string().min(3).max(80),
  description: z.string().max(400),
  weight: z.int().min(0).max(100),                   // relative importance, used by the rule builder's defaults
  markets: z.array(MarketSchema).min(1),
  evidenceRequired: z.string().max(280),             // "Places listing with no website field"
  detectingSources: z.array(SourceAdapterIdSchema).default([]),   // adapters that emit it (source-adapter.md §3a); [] for derived signals (stored Signal rows use a different field, detectedBy)
  confirmedBy: z.array(AuditCheckIdSchema).default([]),
  derivedFrom: z.enum(["enrichment", "audit"]).optional(),  // derived signals are written by Phase 9 or 10, not by an adapter (e.g. outdated_site)
  future: z.boolean().default(false),                // declared now, no detector yet (e.g. weak_ad_creatives)
}).refine((sig) => sig.id !== "manual_lead", { error: "manual_lead is reserved (source-adapter.md §3a); don't declare it", path: ["id"] });

export const SourceConfigSchema = z.object({
  adapterId: SourceAdapterIdSchema,
  markets: z.array(MarketSchema).min(1),
  enabled: z.boolean().default(true),
  optional: z.boolean().default(false),              // tolerated if the adapter isn't registered yet
  defaultParams: z.partialRecord(MarketSchema, z.record(z.string(), z.unknown())),  // validated by the adapter's paramsSchema
});

export const AuditConfigSchema = z.object({
  agentId: AuditAgentIdSchema,
  checks: z.array(z.object({ checkId: AuditCheckIdSchema, required: z.boolean() })).min(1),
});

export const ScoringRuleSchema = z.object({
  id: SlugIdSchema,
  label: z.string().min(3).max(80),                  // shown in score reasons, e.g. "No website on Google Maps"
  condition: ConditionSchema,
  points: z.int().min(-50).max(50),
});
export const ScoringSchema = z.object({
  rules: z.array(ScoringRuleSchema).min(1).max(60),
  qualifyThreshold: z.int().min(0).max(100).default(61),   // QUALIFIED ≥ threshold; must sit just above the band (band 40–60 → 61)
  borderlineBand: z.object({ min: z.int().min(0).max(100).default(40), max: z.int().min(0).max(100).default(60) }),
  lowScoreAction: z.enum(["DISQUALIFY", "NURTURE"]).default("DISQUALIFY"),
}).refine((s) => s.borderlineBand.min <= s.borderlineBand.max, { error: "borderlineBand.min must be ≤ max" })
  .refine((s) => s.qualifyThreshold === s.borderlineBand.max + 1, { error: "qualifyThreshold must be borderlineBand.max + 1", path: ["qualifyThreshold"] });

/** One item of a lead's score explanation (Lead.scoreReasons, SEAM-LEAD-BRIEF). Sorted by |points| descending. */
export const ScoreReasonSchema = z.object({ ruleId: SlugIdSchema, label: z.string(), points: z.int() });
export type ScoreReason = z.infer<typeof ScoreReasonSchema>;

export const PitchAngleSchema = z.object({
  id: SlugIdSchema,
  hook: z.string().min(10).max(200),                 // one line
  whenToUse: z.object({ signals: z.array(SlugIdSchema).default([]), findingChecks: z.array(AuditCheckIdSchema).default([]) }),
  proofTags: z.array(z.string().regex(/^[a-z0-9-]+$/)).default([]),
  avoidPhrases: z.array(z.string().max(80)).default([]),
});

export const PortfolioItemSchema = z.object({
  id: SlugIdSchema,
  title: z.string().max(120),
  description: z.string().max(600),
  url: HttpUrlSchema.optional(),
  mediaFileKey: z.string().optional(),               // FileObject key (purpose PORTFOLIO)
  tags: z.array(z.string().regex(/^[a-z0-9-]+$/)).min(1),
  markets: z.array(MarketSchema).min(1),
  outcomeMetric: z.string().max(160).optional(),     // "Bookings up 38% in 3 months"
  isPlaceholder: z.boolean(),                         // INV-19: placeholders are never attached to outreach or proposals
});

export const PriceRangeSchema = z.object({
  market: MarketSchema, currency: CurrencySchema,
  minMinor: MinorUnitsSchema, typicalMinor: MinorUnitsSchema, maxMinor: MinorUnitsSchema,
}).refine((p) => p.minMinor <= p.typicalMinor && p.typicalMinor <= p.maxMinor, { error: "Need min ≤ typical ≤ max" })
  .refine((p) => (MARKET_CURRENCIES[p.market] as readonly string[]).includes(p.currency), { error: "Currency doesn't suit the market" });

export const PricingPackageSchema = z.object({
  id: SlugIdSchema,                                  // "starter_site"; referenced by proposals and deals
  name: z.string().max(80),                          // matches services-catalogue.md package names
  includes: z.array(z.string().max(160)).min(1),
  timelineWeeks: z.object({ min: z.int().min(1), max: z.int().min(1) }),
  prices: z.array(PriceRangeSchema).min(1),
});
export const PricingSchema = z.object({
  needsReview: z.boolean(),                          // true until Prince confirms the figures (launch gate)
  packages: z.array(PricingPackageSchema).min(1),
});

/** Every step also stops on these regardless of the list (INV-2, INV-3); listing them keeps the profile explicit. */
export const SEQUENCE_STOP_CONDITIONS = ["ANY_REPLY", "BOUNCE", "UNSUBSCRIBE", "MEETING_BOOKED", "SUPPRESSED", "LEAD_INACTIVE"] as const;
export const SequenceStopConditionSchema = z.enum(SEQUENCE_STOP_CONDITIONS);
export const SequenceStepDefinitionSchema = z.object({
  index: z.int().min(0),
  channel: ChannelSchema,                            // EMAIL is the only automatic channel (INV-7)
  delayBusinessDays: z.int().min(0).max(30),         // from the previous step; step 0 = 0
  purpose: z.enum(["INTRO_AUDIT_INSIGHT", "VALUE_ADD", "PORTFOLIO_PROOF", "SOFT_BREAKUP", "CALL", "FOLLOW_UP"]),
  pitchAngleId: SlugIdSchema.optional(),
  includeBookingLink: z.boolean().default(false),
  stopConditions: z.array(SequenceStopConditionSchema).default([...SEQUENCE_STOP_CONDITIONS]),
});
export const SequenceDefinitionSchema = z.object({
  id: SlugIdSchema,
  name: z.string().max(80),
  isDefault: z.boolean(),
  steps: z.array(SequenceStepDefinitionSchema).min(1).max(8),
});

export const DisqualifierSchema = z.object({
  id: SlugIdSchema,
  label: z.string().max(80),
  description: z.string().max(280),
  condition: ConditionSchema.optional(),             // omitted = judged by humans/AI review only (e.g. "competitor agency")
  aiReviewHint: z.string().max(280).optional(),      // passed to acquisition.score-borderline-review
});

export const CapacityPolicySchema = z.object({
  slowAtPercent: z.int().min(1).max(100).default(70),
  pauseAtPercent: z.int().min(1).max(200).default(100),
  slowFactor: z.number().min(0).max(1).default(0.3),       // SLOW cap = normal cap × factor
  pauseScheduledSearches: z.boolean().default(true),
  newQualifiedLeadsWhenPaused: z.enum(["NURTURE", "CONTINUE"]).default("NURTURE"),
  dailyFirstTouchCap: z.int().min(0).max(500).optional(),  // overrides setting acquisition.firstTouchDailyCapPerLine
});

// ---------- The profile ----------
export const ServiceLineProfileSchema = z.object({
  schemaVersion: z.literal(1),
  id: ServiceLineSchema,
  label: z.string().max(40),                         // "Web Development"
  description: z.string().max(280),                  // one line shown in the line header
  owners: z.object({ roles: z.array(RoleSchema).default(["SERVICE_LEAD"]), userIds: z.array(IdSchema).default([]) }),
  contactRolePriority: z.array(z.string().max(60)).min(1),   // e.g. ["owner", "founder", "operations manager", "marketing manager"] (Phase 9)
  signals: z.array(SignalDefinitionSchema).min(1),
  sources: z.array(SourceConfigSchema).min(1),
  audits: z.array(AuditConfigSchema).min(1),
  scoring: ScoringSchema,
  pitchAngles: z.record(MarketSchema, z.array(PitchAngleSchema).min(3).max(5)),   // both markets required
  portfolio: z.array(PortfolioItemSchema),
  pricing: PricingSchema,
  sequences: z.record(MarketSchema, z.array(SequenceDefinitionSchema).min(1)),   // both markets; exactly one isDefault each
  disqualifiers: z.array(DisqualifierSchema),
  approvalMode: ApprovalModeSchema,
  autoSendMinScore: z.int().min(0).max(100).optional(),
  capacityPolicy: CapacityPolicySchema,
}).superRefine((p, ctx) => {
  if (p.approvalMode === "AUTO_SEND_ABOVE_SCORE" && p.autoSendMinScore === undefined)
    ctx.addIssue({ code: "custom", path: ["autoSendMinScore"], message: "Required when approvalMode is AUTO_SEND_ABOVE_SCORE" });
  for (const m of ["NIGERIA", "INTERNATIONAL"] as const)
    if (p.sequences[m].filter((s) => s.isDefault).length !== 1)
      ctx.addIssue({ code: "custom", path: ["sequences", m], message: "Exactly one default sequence per market" });
});
export type ServiceLineProfile = z.infer<typeof ServiceLineProfileSchema>;

/** Reference data injected into validateProfile (Phase 7); defaults to the contract lists. */
export type ProfileKnownRefs = {
  adapterIds: readonly string[]; auditChecks: Readonly<Record<string, readonly string[]>>; userIds: readonly string[];
};
export type ProfileValidationIssue = { path: (string | number)[]; severity: "error" | "warning"; code: string; message: string };
```

## 3. Rules

1. **Schema validity (INV-16).** Every stored profile parses with `ServiceLineProfileSchema`. The database never holds an invalid profile, and a write that fails validation is rejected with `VALIDATION_FAILED` and the issue list.
2. **Reference validation.** Phase 7's `validateProfile(profile, known)` runs the schema plus these reference checks:
   - **Errors:** an unknown adapter ID or audit check; a scoring rule or disqualifier referencing an unknown signal; a pitch angle referencing an unknown signal or check; a sequence step referencing an unknown pitch angle; a currency that doesn't suit its market.
   - **Warnings:** a pitch angle whose proof tags match no non-placeholder portfolio item; `pricing.needsReview`; placeholder portfolio items; `future` signals with no detector; a signal whose `detectingSources` names an adapter that doesn't emit it (`ADAPTER_SIGNAL_TYPES` in source-adapter.md; `csv-import` and `manual` emit any profile signal).
   - **Accepted, not flagged:** derived signals (`detectingSources: []`, optionally `derivedFrom`), which Phases 9 and 10 write after enrichment or an audit; and references to the reserved `manual_lead`, which every profile knows implicitly (weight 0, never scored) and never declares. The adapter → signal table is in source-adapter.md §3a.

   Only errors block publishing.
3. **IDs are stable.** Signal, pitch angle, package, sequence, rule and portfolio IDs are read-only once published, because leads, messages, proposals and deals reference them. Renaming means adding a new ID and retiring the old one.
4. **Versioning.**
   - Phase 7's defaults live as code in `src/modules/acquisition/profiles/defaults/`. They seed version 1 only when a line has no version, and never overwrite a database edit.
   - After that the database is the source of truth. Every edit is a new `ServiceLineProfileVersion`: `saveDraft` creates or replaces the single unpublished `DRAFT`, and `publishProfile` validates it, marks it `PUBLISHED` and `isActive`, and deactivates the previous version, all in one transaction.
   - A rollback re-activates an older published version. Version numbers are never reused.
   - Each publish and rollback is audited (INV-20) and emits `profile.published`.
5. **One active version per line** (INV-16), enforced by a partial unique index.
6. **Conditions** are evaluated purely against `ScoringFacts`: all atoms must hold.
   - `signal` atoms match on `signalType`, including derived signals written by Phases 9 and 10. The reserved `manual_lead` signal carries weight 0 and never changes a score.
   - `finding` atoms consider only non-dismissed findings of the lead. `minSeverity` uses the order INFO < LOW < MEDIUM < HIGH < CRITICAL.
   - `field` atoms with `in`/`notIn` need an array value, and the others need a scalar.
   - A `null` fact never matches, except under `neq` and `notIn`.
7. **Scoring.**
   - The score is the sum of matching rule points, clamped to 0..100.
   - Bands: `QUALIFIED` when score ≥ `qualifyThreshold` (which equals `borderlineBand.max + 1`); `BORDERLINE` when within `borderlineBand` (inclusive); `BELOW` under `borderlineBand.min`. Defaults: 61, 40–60 (boundary tests 39/40/60/61).
   - Phase 11 executes the rules deterministically, with golden tests.
8. **Pitch angles.** Each market has 3–5 angles. `resolvePitchAngle` ranks them by overlap with the lead's signals and findings.
9. **Portfolio (INV-19).** `resolvePortfolio` never returns an `isPlaceholder` item, and outreach and proposals attach only resolved items.
10. **Pricing.**
    - Packages carry ranges per market in minor units.
    - Nigeria is priced in NGN. International packages carry USD and GBP prices, and EUR when the line sells to the eurozone.
    - Proposal prices must fall within a package's range, or they need exception approval (`acquisition.proposal.approveException`).
    - `needsReview: true` is a launch gate (Phase 21).
11. **Sequences.**
    - Each market has exactly one default sequence.
    - Steps use business days in the recipient's country.
    - Only `EMAIL` steps can send automatically. `WHATSAPP_ASSISTED`, `LINKEDIN_ASSISTED` and `CALL_TASK` steps always go to a human (INV-7).
    - Defaults: Nigeria starts with assisted WhatsApp and then email; International starts with email and includes one LinkedIn-assisted touch.
    - Enrolments snapshot the sequence into `Sequence`/`SequenceStep` rows (Phase 12), so a later profile edit doesn't change a running enrolment.
12. **Approval mode.** The default is `ALWAYS_REVIEW`. `AUTO_SEND_ABOVE_SCORE` requires `autoSendMinScore`. Only drafts that pass every automatic check and aren't flagged `needsHumanReview` or `complianceReview` are auto-approved (Phase 12).
13. **Capacity policy.** It overrides the throttle settings for its line: `NORMAL` below `slowAtPercent`, `SLOW` from `slowAtPercent`, `PAUSED` from `pauseAtPercent` (Phase 11). While paused, scheduled searches are skipped when `pauseScheduledSearches` is set.
14. **Owners.** They resolve at runtime: users with a role in `owners.roles` whose `TeamProfile.serviceLines` include the line, plus the explicit `owners.userIds`. `getLineOwners` lives in Phase 7 and uses `@/platform/team`.
15. **Editing UI (Phase 18).** The editor works only through the Phase 7 services: `saveDraft`, `validateProfile`, `diffProfiles`, `publishProfile` and `rollbackProfile`. The Advanced JSON view (`ADMIN` only) validates against this schema before saving.

## 4. Worked example (abridged Video Editing profile, valid)

```json
{
  "schemaVersion": 1,
  "id": "VIDEO_EDITING",
  "label": "Video Editing",
  "description": "Editing, captions and thumbnails for creators, coaches and brands that post video.",
  "owners": { "roles": ["SERVICE_LEAD"], "userIds": [] },
  "contactRolePriority": ["creator", "channel manager", "founder", "marketing manager"],
  "signals": [
    { "id": "no_captions", "label": "Videos without captions", "description": "Most recent uploads have no caption track.", "weight": 20,
      "markets": ["NIGERIA", "INTERNATIONAL"], "evidenceRequired": "contentDetails.caption=false on ≥ 50% of last 20 videos",
      "detectingSources": [], "confirmedBy": ["video.captions"], "derivedFrom": "audit", "future": false },
    { "id": "gone_quiet", "label": "Channel has gone quiet", "description": "Posting gap is growing; last upload > 45 days ago.", "weight": 15,
      "markets": ["NIGERIA", "INTERNATIONAL"], "evidenceRequired": "Longest gap trend and last upload date",
      "detectingSources": ["youtube-channels"], "confirmedBy": ["video.cadence"], "future": false }
  ],
  "sources": [
    { "adapterId": "youtube-channels", "markets": ["NIGERIA", "INTERNATIONAL"], "enabled": true, "optional": false,
      "defaultParams": { "NIGERIA": { "regionCode": "NG", "keywords": ["lagos vlog", "nigerian coach"] },
                         "INTERNATIONAL": { "regionCode": "GB", "keywords": ["business coach", "fitness coach"] } } },
    { "adapterId": "jobs-serpapi", "markets": ["NIGERIA", "INTERNATIONAL"], "enabled": true, "optional": false,
      "defaultParams": { "NIGERIA": { "jobTitles": ["video editor"], "location": "Nigeria" },
                         "INTERNATIONAL": { "jobTitles": ["video editor"], "location": "United Kingdom" } } }
  ],
  "audits": [ { "agentId": "audit.video", "checks": [
      { "checkId": "video.cadence", "required": true }, { "checkId": "video.captions", "required": true },
      { "checkId": "video.thumbnails", "required": false } ] } ],
  "scoring": {
    "rules": [
      { "id": "has_no_captions", "label": "Most videos have no captions",
        "condition": { "all": [ { "kind": "finding", "checkId": "video.captions", "minSeverity": "MEDIUM", "pitchableOnly": true, "negate": false } ] }, "points": 25 },
      { "id": "reachable_owner", "label": "We can reach the creator directly",
        "condition": { "all": [ { "kind": "field", "field": "contact.primary.emailStatus", "op": "eq", "value": "VALID" } ] }, "points": 15 },
      { "id": "role_email_only", "label": "Only a generic inbox found",
        "condition": { "all": [ { "kind": "field", "field": "contact.primary.emailType", "op": "eq", "value": "ROLE" } ] }, "points": -5 }
    ],
    "qualifyThreshold": 61, "borderlineBand": { "min": 40, "max": 60 }, "lowScoreAction": "DISQUALIFY"
  },
  "pitchAngles": {
    "NIGERIA": [
      { "id": "captions_reach", "hook": "Captions help your videos reach viewers watching on mute.", "whenToUse": { "signals": ["no_captions"], "findingChecks": ["video.captions"] }, "proofTags": ["captions"], "avoidPhrases": ["your videos are bad"] },
      { "id": "consistency", "hook": "A steady posting rhythm without the editing load on you.", "whenToUse": { "signals": ["gone_quiet"], "findingChecks": ["video.cadence"] }, "proofTags": ["retainer"], "avoidPhrases": [] },
      { "id": "thumbnails", "hook": "Thumbnails that match your brand and read at a glance.", "whenToUse": { "signals": [], "findingChecks": ["video.thumbnails"] }, "proofTags": ["thumbnails"], "avoidPhrases": [] }
    ],
    "INTERNATIONAL": [
      { "id": "timezone_overlap", "hook": "An editing team in Lagos that works your UK hours.", "whenToUse": { "signals": [], "findingChecks": [] }, "proofTags": ["retainer"], "avoidPhrases": ["cheap", "offshore"] },
      { "id": "captions_reach", "hook": "Captions help your videos reach viewers watching on mute.", "whenToUse": { "signals": ["no_captions"], "findingChecks": ["video.captions"] }, "proofTags": ["captions"], "avoidPhrases": [] },
      { "id": "consistency", "hook": "A steady posting rhythm without the editing load on you.", "whenToUse": { "signals": ["gone_quiet"], "findingChecks": ["video.cadence"] }, "proofTags": ["retainer"], "avoidPhrases": [] }
    ]
  },
  "portfolio": [
    { "id": "todo_captions_case", "title": "TODO: captions case study", "description": "Placeholder until real FUTUREUNI work is added.",
      "tags": ["captions"], "markets": ["NIGERIA", "INTERNATIONAL"], "isPlaceholder": true }
  ],
  "pricing": { "needsReview": true, "packages": [
    { "id": "monthly_4_videos", "name": "Creator retainer (4 videos a month)", "includes": ["Editing", "Captions", "Thumbnails"],
      "timelineWeeks": { "min": 4, "max": 4 },
      "prices": [ { "market": "NIGERIA", "currency": "NGN", "minMinor": 15000000, "typicalMinor": 25000000, "maxMinor": 40000000 },
                  { "market": "INTERNATIONAL", "currency": "GBP", "minMinor": 60000, "typicalMinor": 90000, "maxMinor": 150000 } ] } ] },
  "sequences": {
    "NIGERIA": [ { "id": "ng_default", "name": "WhatsApp first", "isDefault": true, "steps": [
      { "index": 0, "channel": "WHATSAPP_ASSISTED", "delayBusinessDays": 0, "purpose": "INTRO_AUDIT_INSIGHT", "pitchAngleId": "captions_reach", "includeBookingLink": false, "stopConditions": ["ANY_REPLY", "BOUNCE", "UNSUBSCRIBE", "MEETING_BOOKED"] },
      { "index": 1, "channel": "EMAIL", "delayBusinessDays": 3, "purpose": "VALUE_ADD", "pitchAngleId": "consistency", "includeBookingLink": true, "stopConditions": ["ANY_REPLY", "BOUNCE", "UNSUBSCRIBE", "MEETING_BOOKED"] } ] } ],
    "INTERNATIONAL": [ { "id": "intl_default", "name": "Email first", "isDefault": true, "steps": [
      { "index": 0, "channel": "EMAIL", "delayBusinessDays": 0, "purpose": "INTRO_AUDIT_INSIGHT", "pitchAngleId": "captions_reach", "includeBookingLink": false, "stopConditions": ["ANY_REPLY", "BOUNCE", "UNSUBSCRIBE", "MEETING_BOOKED"] },
      { "index": 1, "channel": "LINKEDIN_ASSISTED", "delayBusinessDays": 2, "purpose": "FOLLOW_UP", "includeBookingLink": false, "stopConditions": ["ANY_REPLY", "BOUNCE", "UNSUBSCRIBE", "MEETING_BOOKED"] },
      { "index": 2, "channel": "EMAIL", "delayBusinessDays": 4, "purpose": "SOFT_BREAKUP", "pitchAngleId": "timezone_overlap", "includeBookingLink": true, "stopConditions": ["ANY_REPLY", "BOUNCE", "UNSUBSCRIBE", "MEETING_BOOKED"] } ] } ]
  },
  "disqualifiers": [
    { "id": "competitor_agency", "label": "Competitor agency", "description": "A production or editing agency itself.", "aiReviewHint": "Channel sells video production services." },
    { "id": "active_client", "label": "Already a client", "description": "Company is an active FUTUREUNI client.",
      "condition": { "all": [ { "kind": "field", "field": "company.isActiveClient", "op": "eq", "value": true } ] } }
  ],
  "approvalMode": "ALWAYS_REVIEW",
  "capacityPolicy": { "slowAtPercent": 70, "pauseAtPercent": 100, "slowFactor": 0.3, "pauseScheduledSearches": true, "newQualifiedLeadsWhenPaused": "NURTURE" }
}
```

## 5. Invalid example (Phase 2 test)

Take the valid profile above and change two things:
- set `"approvalMode": "AUTO_SEND_ABOVE_SCORE"` without `autoSendMinScore`
- set the NIGERIA price to `"currency": "USD"`

```ts
ServiceLineProfileSchema.safeParse(modified);
// → fails: ["pricing","packages",0,"prices",0] "Currency doesn't suit the market";
//          ["autoSendMinScore"] "Required when approvalMode is AUTO_SEND_ABOVE_SCORE"
```
