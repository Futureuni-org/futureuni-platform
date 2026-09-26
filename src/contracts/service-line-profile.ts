/**
 * Contract: service-line profile (docs/contracts/service-line-profile.md). Stored in
 * ServiceLineProfileVersion.profile and validated with ServiceLineProfileSchema on every write
 * (INV-16). Implemented by Phase 7 (@/modules/acquisition/profiles).
 */

import { z } from "zod";

import { AuditAgentIdSchema, AuditCheckIdSchema } from "./audit-agent";
import {
  ApprovalModeSchema,
  ChannelSchema,
  CurrencySchema,
  FindingSeveritySchema,
  HttpUrlSchema,
  IdSchema,
  MARKET_CURRENCIES,
  MarketSchema,
  MinorUnitsSchema,
  RoleSchema,
  ServiceLineSchema,
  SlugIdSchema,
  type CompanySizeRange,
  type ContactSeniority,
  type EmailStatus,
  type EmailType,
  type FindingSeverity,
  type LegalForm,
  type Market,
  type WebsiteKind,
  type WhatsAppStatus,
} from "./common";
import type { EmailVerdict } from "./enrichment";
import { SourceAdapterIdSchema } from "./source-adapter";

// ---------- Conditions (used by scoring rules and disqualifiers) ----------
// Stored as structured JSON (an AST), so no free-text parser is needed and the Phase 18 rule builder edits it directly.
// Canonical text form (for display, diffs and the Advanced JSON view) is shown next to each atom.

export const ConditionFieldSchema = z.enum([
  "market", // Market                 market == NIGERIA
  "country", // CountryCode            country in [GB, IE]
  "company.legalForm", // LegalForm              company.legalForm in [LIMITED, LLP]
  "company.sizeRange", // CompanySizeRange (ordered SOLO < … < SIZE_1000_PLUS; UNKNOWN never matches >,<)
  "company.websiteKind", // WebsiteKind            company.websiteKind == SOCIAL_ONLY
  "company.hasWebsite", // boolean                company.hasWebsite == false
  "company.industry", // string (normalised lower-case)
  "company.isActiveClient", // boolean
  "company.copyrightYear", // int (null never matches)
  "contact.primary.exists", // boolean
  "contact.primary.emailStatus", // EmailStatus            contact.primary.emailStatus == VALID
  "contact.primary.emailType", // EmailType              contact.primary.emailType == ROLE
  "contact.primary.whatsappStatus", // WhatsAppStatus
  "contact.primary.seniority", // ContactSeniority        contact.primary.seniority in [OWNER, EXEC]
  "contactability.email", // "ALLOWED" | "CONSENT_REQUIRED" | "REVIEW" | "BLOCKED"
  "contactability.hasAssistedChannel", // boolean (WhatsApp, LinkedIn or phone allowed)
  "signal.count", // int: signals for this lead's line
  "finding.pitchableCount", // int: non-dismissed pitchable findings
]);
export type ConditionField = z.infer<typeof ConditionFieldSchema>;

const scalar = z.union([z.string().max(80), z.int(), z.boolean()]);
export const ConditionAtomSchema = z.discriminatedUnion("kind", [
  // signal:no_website            |  NOT signal:no_website
  z.object({
    kind: z.literal("signal"),
    signalId: SlugIdSchema,
    negate: z.boolean().default(false),
  }),
  // finding.severity>=HIGH:web.pagespeed_mobile   |   finding.present:web.ssl
  z.object({
    kind: z.literal("finding"),
    checkId: AuditCheckIdSchema,
    minSeverity: FindingSeveritySchema.optional(), // omitted = any non-dismissed finding for the check
    pitchableOnly: z.boolean().default(false),
    negate: z.boolean().default(false),
  }),
  // company.legalForm in [LIMITED, LLP]   |   contact.primary.emailStatus == VALID   |   signal.count >= 2
  z.object({
    kind: z.literal("field"),
    field: ConditionFieldSchema,
    op: z.enum(["eq", "neq", "in", "notIn", "gt", "gte", "lt", "lte"]),
    value: z.union([scalar, z.array(scalar).min(1).max(20)]),
  }),
]);
export type ConditionAtom = z.infer<typeof ConditionAtomSchema>;
/** All atoms must hold (AND). Use separate rules for OR. Max 5 atoms keeps rules explainable. */
export const ConditionSchema = z.object({ all: z.array(ConditionAtomSchema).min(1).max(5) });
export type Condition = z.infer<typeof ConditionSchema>;

/** The flattened facts a condition is evaluated against (built by Phase 11; pure evaluation, no I/O). */
export interface ScoringFacts {
  market: Market;
  country: string | null;
  company: {
    legalForm: LegalForm;
    sizeRange: CompanySizeRange;
    websiteKind: WebsiteKind;
    hasWebsite: boolean;
    industry: string | null;
    isActiveClient: boolean;
    copyrightYear: number | null;
  };
  contact: {
    primary: {
      exists: boolean;
      emailStatus: EmailStatus | null;
      emailType: EmailType | null;
      whatsappStatus: WhatsAppStatus | null;
      seniority: ContactSeniority | null;
    };
  };
  contactability: { email: EmailVerdict; hasAssistedChannel: boolean };
  signals: { id: string; signalType: string }[];
  findings: {
    id: string;
    checkId: string;
    severity: FindingSeverity;
    pitchable: boolean;
    dismissed: false;
  }[];
}

// ---------- Profile parts ----------
export const SignalDefinitionSchema = z
  .object({
    id: SlugIdSchema, // "no_website"; read-only once published
    label: z.string().min(3).max(80),
    description: z.string().max(400),
    weight: z.int().min(0).max(100), // relative importance, used by the rule builder's defaults
    markets: z.array(MarketSchema).min(1),
    evidenceRequired: z.string().max(280), // "Places listing with no website field"
    detectingSources: z.array(SourceAdapterIdSchema).default([]), // adapters that emit it (source-adapter.md §3a); [] for derived signals (stored Signal rows use a different field, detectedBy)
    confirmedBy: z.array(AuditCheckIdSchema).default([]),
    derivedFrom: z.enum(["enrichment", "audit"]).optional(), // derived signals are written by Phase 9 or 10, not by an adapter (e.g. outdated_site)
    future: z.boolean().default(false), // declared now, no detector yet (e.g. weak_ad_creatives)
  })
  .refine((sig) => sig.id !== "manual_lead", {
    error: "manual_lead is reserved (source-adapter.md §3a); don't declare it",
    path: ["id"],
  });

export const SourceConfigSchema = z.object({
  adapterId: SourceAdapterIdSchema,
  markets: z.array(MarketSchema).min(1),
  enabled: z.boolean().default(true),
  optional: z.boolean().default(false), // tolerated if the adapter isn't registered yet
  defaultParams: z.partialRecord(MarketSchema, z.record(z.string(), z.unknown())), // validated by the adapter's paramsSchema
});

export const AuditConfigSchema = z.object({
  agentId: AuditAgentIdSchema,
  checks: z.array(z.object({ checkId: AuditCheckIdSchema, required: z.boolean() })).min(1),
});

export const ScoringRuleSchema = z.object({
  id: SlugIdSchema,
  label: z.string().min(3).max(80), // shown in score reasons, e.g. "No website on Google Maps"
  condition: ConditionSchema,
  points: z.int().min(-50).max(50),
});
export const ScoringSchema = z
  .object({
    rules: z.array(ScoringRuleSchema).min(1).max(60),
    qualifyThreshold: z.int().min(0).max(100).default(61), // QUALIFIED ≥ threshold; must sit just above the band (band 40–60 → 61)
    borderlineBand: z.object({
      min: z.int().min(0).max(100).default(40),
      max: z.int().min(0).max(100).default(60),
    }),
    lowScoreAction: z.enum(["DISQUALIFY", "NURTURE"]).default("DISQUALIFY"),
  })
  .refine((s) => s.borderlineBand.min <= s.borderlineBand.max, {
    error: "borderlineBand.min must be ≤ max",
  })
  .refine((s) => s.qualifyThreshold === s.borderlineBand.max + 1, {
    error: "qualifyThreshold must be borderlineBand.max + 1",
    path: ["qualifyThreshold"],
  });

/** One item of a lead's score explanation (Lead.scoreReasons, SEAM-LEAD-BRIEF). Sorted by |points| descending. */
export const ScoreReasonSchema = z.object({
  ruleId: SlugIdSchema,
  label: z.string(),
  points: z.int(),
});
export type ScoreReason = z.infer<typeof ScoreReasonSchema>;

export const PitchAngleSchema = z.object({
  id: SlugIdSchema,
  hook: z.string().min(10).max(200), // one line
  whenToUse: z.object({
    signals: z.array(SlugIdSchema).default([]),
    findingChecks: z.array(AuditCheckIdSchema).default([]),
  }),
  proofTags: z.array(z.string().regex(/^[a-z0-9-]+$/)).default([]),
  avoidPhrases: z.array(z.string().max(80)).default([]),
});

export const PortfolioItemSchema = z.object({
  id: SlugIdSchema,
  title: z.string().max(120),
  description: z.string().max(600),
  url: HttpUrlSchema.optional(),
  mediaFileKey: z.string().optional(), // FileObject key (purpose PORTFOLIO)
  tags: z.array(z.string().regex(/^[a-z0-9-]+$/)).min(1),
  markets: z.array(MarketSchema).min(1),
  outcomeMetric: z.string().max(160).optional(), // "Bookings up 38% in 3 months"
  isPlaceholder: z.boolean(), // INV-19: placeholders are never attached to outreach or proposals
});

export const PriceRangeSchema = z
  .object({
    market: MarketSchema,
    currency: CurrencySchema,
    minMinor: MinorUnitsSchema,
    typicalMinor: MinorUnitsSchema,
    maxMinor: MinorUnitsSchema,
  })
  .refine((p) => p.minMinor <= p.typicalMinor && p.typicalMinor <= p.maxMinor, {
    error: "Need min ≤ typical ≤ max",
  })
  .refine((p) => (MARKET_CURRENCIES[p.market] as readonly string[]).includes(p.currency), {
    error: "Currency doesn't suit the market",
  });

export const PricingPackageSchema = z.object({
  id: SlugIdSchema, // "starter_site"; referenced by proposals and deals
  name: z.string().max(80), // matches services-catalogue.md package names
  includes: z.array(z.string().max(160)).min(1),
  timelineWeeks: z.object({ min: z.int().min(1), max: z.int().min(1) }),
  prices: z.array(PriceRangeSchema).min(1),
});
export const PricingSchema = z.object({
  needsReview: z.boolean(), // true until Prince confirms the figures (launch gate)
  packages: z.array(PricingPackageSchema).min(1),
});

/** Every step also stops on these regardless of the list (INV-2, INV-3); listing them keeps the profile explicit. */
export const SEQUENCE_STOP_CONDITIONS = [
  "ANY_REPLY",
  "BOUNCE",
  "UNSUBSCRIBE",
  "MEETING_BOOKED",
  "SUPPRESSED",
  "LEAD_INACTIVE",
] as const;
export const SequenceStopConditionSchema = z.enum(SEQUENCE_STOP_CONDITIONS);
/** Every step purpose (SequenceStep.purpose stores one of these). */
export const SequenceStepPurposeSchema = z.enum([
  "INTRO_AUDIT_INSIGHT",
  "VALUE_ADD",
  "PORTFOLIO_PROOF",
  "SOFT_BREAKUP",
  "CALL",
  "FOLLOW_UP",
]);
export const SequenceStepDefinitionSchema = z.object({
  index: z.int().min(0),
  channel: ChannelSchema, // EMAIL is the only automatic channel (INV-7)
  delayBusinessDays: z.int().min(0).max(30), // from the previous step; step 0 = 0
  purpose: SequenceStepPurposeSchema,
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
  condition: ConditionSchema.optional(), // omitted = judged by humans/AI review only (e.g. "competitor agency")
  aiReviewHint: z.string().max(280).optional(), // passed to acquisition.score-borderline-review
});

export const CapacityPolicySchema = z.object({
  slowAtPercent: z.int().min(1).max(100).default(70),
  pauseAtPercent: z.int().min(1).max(200).default(100),
  slowFactor: z.number().min(0).max(1).default(0.3), // SLOW cap = normal cap × factor
  pauseScheduledSearches: z.boolean().default(true),
  newQualifiedLeadsWhenPaused: z.enum(["NURTURE", "CONTINUE"]).default("NURTURE"),
  dailyFirstTouchCap: z.int().min(0).max(500).optional(), // overrides setting acquisition.firstTouchDailyCapPerLine
});

// ---------- The profile ----------
export const ServiceLineProfileSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: ServiceLineSchema,
    label: z.string().max(40), // "Web Development"
    description: z.string().max(280), // one line shown in the line header
    owners: z.object({
      roles: z.array(RoleSchema).default(["SERVICE_LEAD"]),
      userIds: z.array(IdSchema).default([]),
    }),
    contactRolePriority: z.array(z.string().max(60)).min(1), // e.g. ["owner", "founder", "operations manager", "marketing manager"] (Phase 9)
    signals: z.array(SignalDefinitionSchema).min(1),
    sources: z.array(SourceConfigSchema).min(1),
    audits: z.array(AuditConfigSchema).min(1),
    scoring: ScoringSchema,
    pitchAngles: z.record(MarketSchema, z.array(PitchAngleSchema).min(3).max(5)), // both markets required
    portfolio: z.array(PortfolioItemSchema),
    pricing: PricingSchema,
    sequences: z.record(MarketSchema, z.array(SequenceDefinitionSchema).min(1)), // both markets; exactly one isDefault each
    disqualifiers: z.array(DisqualifierSchema),
    approvalMode: ApprovalModeSchema,
    autoSendMinScore: z.int().min(0).max(100).optional(),
    capacityPolicy: CapacityPolicySchema,
  })
  .superRefine((p, ctx) => {
    if (p.approvalMode === "AUTO_SEND_ABOVE_SCORE" && p.autoSendMinScore === undefined)
      ctx.addIssue({
        code: "custom",
        path: ["autoSendMinScore"],
        message: "Required when approvalMode is AUTO_SEND_ABOVE_SCORE",
      });
    for (const m of ["NIGERIA", "INTERNATIONAL"] as const)
      if (p.sequences[m].filter((s) => s.isDefault).length !== 1)
        ctx.addIssue({
          code: "custom",
          path: ["sequences", m],
          message: "Exactly one default sequence per market",
        });
  });
export type ServiceLineProfile = z.infer<typeof ServiceLineProfileSchema>;

/** Reference data injected into validateProfile (Phase 7); defaults to the contract lists. */
export interface ProfileKnownRefs {
  adapterIds: readonly string[];
  auditChecks: Readonly<Record<string, readonly string[]>>;
  userIds: readonly string[];
}
export interface ProfileValidationIssue {
  path: (string | number)[];
  severity: "error" | "warning";
  code: string;
  message: string;
}
