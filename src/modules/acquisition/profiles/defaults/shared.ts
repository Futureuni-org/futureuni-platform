import "server-only";

/**
 * Shared building blocks for the four default service-line profiles (module spec §3.3).
 *
 * Rules encoded here are the "Common to all four lines" set from the spec: bands, positive
 * and negative rules, disqualifiers, capacity policy, approval mode and sequence stop
 * conditions. Every default profile composes these plus its line-specific content.
 */

import {
  SEQUENCE_STOP_CONDITIONS,
  type CapacityPolicySchema,
  type DisqualifierSchema,
  type ScoringRuleSchema,
  type SequenceStepDefinitionSchema,
} from "@/contracts/service-line-profile";
import type { z } from "zod";

type ScoringRule = z.infer<typeof ScoringRuleSchema>;
type Disqualifier = z.infer<typeof DisqualifierSchema>;
type CapacityPolicy = z.infer<typeof CapacityPolicySchema>;
type StepDef = z.infer<typeof SequenceStepDefinitionSchema>;

// -------------------------------------------------------------------------------------------
// Scoring — common rules every profile mixes in.
// -------------------------------------------------------------------------------------------

export const COMMON_POSITIVE_RULES: readonly ScoringRule[] = [
  {
    id: "reachable_owner",
    label: "Reachable primary contact",
    condition: {
      all: [
        {
          kind: "field",
          field: "contact.primary.emailStatus",
          op: "eq",
          value: "VALID",
        },
      ],
    },
    points: 10,
  },
  {
    id: "nigeria_whatsapp",
    label: "Nigeria with a WhatsApp channel",
    condition: {
      all: [
        { kind: "field", field: "market", op: "eq", value: "NIGERIA" },
        {
          kind: "field",
          field: "contact.primary.whatsappStatus",
          op: "in",
          value: ["CONFIRMED", "LIKELY"],
        },
      ],
    },
    points: 8,
  },
  {
    id: "legal_form_known",
    label: "Legal form known",
    condition: {
      all: [{ kind: "field", field: "company.legalForm", op: "neq", value: "UNKNOWN" }],
    },
    points: 3,
  },
];

export const COMMON_NEGATIVE_RULES: readonly ScoringRule[] = [
  {
    id: "role_email_only",
    label: "Only a generic role email",
    condition: {
      all: [{ kind: "field", field: "contact.primary.emailType", op: "eq", value: "ROLE" }],
    },
    points: -5,
  },
  {
    id: "enterprise_size",
    label: "Enterprise size",
    condition: {
      all: [
        {
          kind: "field",
          field: "company.sizeRange",
          op: "in",
          value: ["SIZE_201_1000", "SIZE_1000_PLUS"],
        },
      ],
    },
    points: -15,
  },
];

// -------------------------------------------------------------------------------------------
// Disqualifiers — common to every line (module spec §3.3 "Common disqualifiers").
// -------------------------------------------------------------------------------------------

export const COMMON_DISQUALIFIERS: readonly Disqualifier[] = [
  {
    id: "competitor_agency",
    label: "Competitor agency",
    description: "The company sells the same service FUTUREUNI does.",
    aiReviewHint: "The prospect's website advertises the same service line.",
  },
  {
    id: "government_body",
    label: "Government body",
    description: "Government departments, ministries or state-owned enterprises.",
    aiReviewHint: "The prospect appears to be a government body or agency.",
  },
  {
    id: "adult_or_gambling",
    label: "Adult or gambling",
    description: "Adult content, casinos or sports betting.",
    aiReviewHint: "The prospect operates in adult content or gambling.",
  },
  {
    id: "active_client",
    label: "Already a FUTUREUNI client",
    description: "Company is already an active FUTUREUNI client.",
    condition: {
      all: [{ kind: "field", field: "company.isActiveClient", op: "eq", value: true }],
    },
  },
  {
    id: "no_channel",
    label: "No reachable channel",
    description:
      "Email is blocked and no WhatsApp, LinkedIn or phone channel is allowed by contactability.",
    condition: {
      all: [
        { kind: "field", field: "contactability.email", op: "eq", value: "BLOCKED" },
        { kind: "field", field: "contactability.hasAssistedChannel", op: "eq", value: false },
      ],
    },
  },
  {
    id: "in_house_team",
    label: "In-house team",
    description:
      "Prospect runs the discipline in-house (many recent job posts, or company size 1000+).",
    condition: {
      all: [{ kind: "field", field: "company.sizeRange", op: "eq", value: "SIZE_1000_PLUS" }],
    },
    aiReviewHint: "Look for 3+ job posts for this discipline in the last 90 days.",
  },
];

// -------------------------------------------------------------------------------------------
// Capacity policy + approval mode — common defaults.
// -------------------------------------------------------------------------------------------

export const COMMON_CAPACITY_POLICY: CapacityPolicy = {
  slowAtPercent: 70,
  pauseAtPercent: 100,
  slowFactor: 0.3,
  pauseScheduledSearches: true,
  newQualifiedLeadsWhenPaused: "NURTURE",
};

export const COMMON_APPROVAL_MODE = "ALWAYS_REVIEW" as const;

/** Full stop-conditions list (INV-2, INV-3); every step gets these by default. */
export const COMMON_STOP_CONDITIONS = [...SEQUENCE_STOP_CONDITIONS] as const;

// -------------------------------------------------------------------------------------------
// Sequence step helpers — build the two default sequences per line (NG / INTL).
// -------------------------------------------------------------------------------------------

interface StepArgs {
  channel: StepDef["channel"];
  delayBusinessDays: number;
  purpose: StepDef["purpose"];
  pitchAngleId?: string;
  includeBookingLink?: boolean;
}

function step(index: number, args: StepArgs): StepDef {
  return {
    index,
    channel: args.channel,
    delayBusinessDays: args.delayBusinessDays,
    purpose: args.purpose,
    ...(args.pitchAngleId === undefined ? {} : { pitchAngleId: args.pitchAngleId }),
    includeBookingLink: args.includeBookingLink ?? false,
    stopConditions: [...COMMON_STOP_CONDITIONS],
  };
}

/** Nigeria default: assisted WhatsApp first, then email touches. */
export function ngWhatsAppFirstEmail(pitchAngles: {
  intro: string;
  valueAdd: string;
  portfolio: string;
  softBreakup: string;
}): StepDef[] {
  return [
    step(0, {
      channel: "WHATSAPP_ASSISTED",
      delayBusinessDays: 0,
      purpose: "INTRO_AUDIT_INSIGHT",
      pitchAngleId: pitchAngles.intro,
    }),
    step(1, {
      channel: "EMAIL",
      delayBusinessDays: 3,
      purpose: "VALUE_ADD",
      pitchAngleId: pitchAngles.valueAdd,
      includeBookingLink: true,
    }),
    step(2, {
      channel: "EMAIL",
      delayBusinessDays: 5,
      purpose: "PORTFOLIO_PROOF",
      pitchAngleId: pitchAngles.portfolio,
    }),
    step(3, {
      channel: "EMAIL",
      delayBusinessDays: 7,
      purpose: "SOFT_BREAKUP",
      pitchAngleId: pitchAngles.softBreakup,
      includeBookingLink: true,
    }),
  ];
}

/** International default: email first, one LinkedIn-assisted touch. */
export function intlEmailFirstLinkedInFollow(pitchAngles: {
  intro: string;
  followUp: string;
  valueAdd: string;
  softBreakup: string;
}): StepDef[] {
  return [
    step(0, {
      channel: "EMAIL",
      delayBusinessDays: 0,
      purpose: "INTRO_AUDIT_INSIGHT",
      pitchAngleId: pitchAngles.intro,
    }),
    step(1, {
      channel: "LINKEDIN_ASSISTED",
      delayBusinessDays: 2,
      purpose: "FOLLOW_UP",
      pitchAngleId: pitchAngles.followUp,
    }),
    step(2, {
      channel: "EMAIL",
      delayBusinessDays: 4,
      purpose: "VALUE_ADD",
      pitchAngleId: pitchAngles.valueAdd,
      includeBookingLink: true,
    }),
    step(3, {
      channel: "EMAIL",
      delayBusinessDays: 6,
      purpose: "SOFT_BREAKUP",
      pitchAngleId: pitchAngles.softBreakup,
      includeBookingLink: true,
    }),
  ];
}

// -------------------------------------------------------------------------------------------
// Scoring defaults every profile uses.
// -------------------------------------------------------------------------------------------

export const DEFAULT_SCORING_BASELINE = {
  qualifyThreshold: 61,
  borderlineBand: { min: 40, max: 60 },
  lowScoreAction: "DISQUALIFY" as const,
};
