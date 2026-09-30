import "server-only";

/**
 * UI/UX Design default profile (module spec §3.3.2). All prices placeholders (needsReview),
 * all portfolio items placeholders (INV-19).
 */

import type { ServiceLineProfile } from "@/contracts/service-line-profile";

import {
  COMMON_APPROVAL_MODE,
  COMMON_CAPACITY_POLICY,
  COMMON_DISQUALIFIERS,
  COMMON_NEGATIVE_RULES,
  COMMON_POSITIVE_RULES,
  DEFAULT_SCORING_BASELINE,
  intlEmailFirstLinkedInFollow,
  ngWhatsAppFirstEmail,
} from "./shared";

export const uiUxDesignDefaultProfile: ServiceLineProfile = {
  schemaVersion: 1,
  id: "UI_UX_DESIGN",
  label: "UI/UX Design",
  description:
    "Product research, flows, design systems and prototypes for teams building web and mobile products.",
  owners: { roles: ["SERVICE_LEAD"], userIds: [] },
  contactRolePriority: [
    "founder",
    "product manager",
    "head of design",
    "cto",
    "operations manager",
  ],

  signals: [
    {
      id: "app_reviews_usability_complaints",
      label: "Usability complaints in app reviews",
      description: "Recent App Store reviews cite friction, confusion or missing basics.",
      weight: 25,
      markets: ["NIGERIA", "INTERNATIONAL"],
      evidenceRequired: "≥ 3 recent 1-3 star reviews naming usability issues.",
      detectingSources: ["apple-app-store"],
      confirmedBy: ["uiux.app_reviews"],
      future: false,
    },
    {
      id: "high_friction_signup",
      label: "High-friction sign-up",
      description: "Sign-up needs many steps or fields with unclear feedback.",
      weight: 20,
      markets: ["NIGERIA", "INTERNATIONAL"],
      evidenceRequired: "Captured onboarding shows > 4 required-field screens with no progress cue.",
      detectingSources: [],
      confirmedBy: ["uiux.onboarding_capture"],
      derivedFrom: "audit",
      future: false,
    },
    {
      id: "inconsistent_ui",
      label: "Inconsistent UI",
      description: "Buttons, spacing or type differ across primary screens.",
      weight: 15,
      markets: ["NIGERIA", "INTERNATIONAL"],
      evidenceRequired: "Heuristic capture shows 3+ inconsistencies between two flows.",
      detectingSources: [],
      confirmedBy: ["uiux.heuristics"],
      derivedFrom: "audit",
      future: false,
    },
    {
      id: "accessibility_failures",
      label: "Accessibility failures",
      description: "Missing labels, low contrast, or focus traps in primary flows.",
      weight: 20,
      markets: ["NIGERIA", "INTERNATIONAL"],
      evidenceRequired: "Automated accessibility check flags ≥ 3 WCAG AA issues.",
      detectingSources: [],
      confirmedBy: ["uiux.accessibility"],
      derivedFrom: "audit",
      future: false,
    },
    {
      id: "recently_funded",
      label: "Recently funded",
      description: "Announced funding within the last 12 months.",
      weight: 20,
      markets: ["INTERNATIONAL"],
      evidenceRequired: "Public funding announcement (optional signal, no detector yet).",
      detectingSources: [],
      confirmedBy: [],
      future: true,
    },
    {
      id: "job_post_product_designer",
      label: "Hiring a product designer",
      description: "Public job post for a product designer within the last 90 days.",
      weight: 15,
      markets: ["NIGERIA", "INTERNATIONAL"],
      evidenceRequired: "Job title matches /product designer|UX designer|UI designer/i.",
      detectingSources: ["jobs-serpapi", "jobs-adzuna", "myjobmag"],
      confirmedBy: [],
      future: false,
    },
  ],

  sources: [
    {
      adapterId: "apple-app-store",
      markets: ["NIGERIA", "INTERNATIONAL"],
      enabled: true,
      optional: true,
      defaultParams: {
        NIGERIA: {
          categories: ["finance", "productivity", "food-and-drink"],
          country: "ng",
        },
        INTERNATIONAL: {
          categories: ["finance", "productivity", "health-and-fitness"],
          country: "gb",
        },
      },
    },
    {
      adapterId: "jobs-serpapi",
      markets: ["NIGERIA", "INTERNATIONAL"],
      enabled: true,
      optional: false,
      defaultParams: {
        NIGERIA: {
          jobTitles: ["product designer", "UI designer", "UX designer"],
          location: "Nigeria",
        },
        INTERNATIONAL: {
          jobTitles: ["product designer", "UI designer", "UX designer"],
          location: "United Kingdom",
        },
      },
    },
  ],

  audits: [
    {
      agentId: "audit.uiux",
      checks: [
        { checkId: "uiux.app_reviews", required: false },
        { checkId: "uiux.onboarding_capture", required: true },
        { checkId: "uiux.heuristics", required: true },
        { checkId: "uiux.accessibility", required: true },
        { checkId: "uiux.mobile_layout", required: false },
      ],
    },
  ],

  scoring: {
    rules: [
      ...COMMON_POSITIVE_RULES,
      ...COMMON_NEGATIVE_RULES,
      {
        id: "review_pain",
        label: "Usability complaints in app reviews",
        condition: {
          all: [{ kind: "signal", signalId: "app_reviews_usability_complaints", negate: false }],
        },
        points: 25,
      },
      {
        id: "friction_signup",
        label: "High-friction sign-up (measured)",
        condition: {
          all: [
            {
              kind: "finding",
              checkId: "uiux.onboarding_capture",
              minSeverity: "MEDIUM",
              pitchableOnly: true,
              negate: false,
            },
          ],
        },
        points: 20,
      },
      {
        id: "accessibility_fail",
        label: "Accessibility fails (measured)",
        condition: {
          all: [
            {
              kind: "finding",
              checkId: "uiux.accessibility",
              minSeverity: "MEDIUM",
              pitchableOnly: true,
              negate: false,
            },
          ],
        },
        points: 15,
      },
      {
        id: "hiring_designer",
        label: "Hiring a product designer",
        condition: {
          all: [{ kind: "signal", signalId: "job_post_product_designer", negate: false }],
        },
        points: 10,
      },
    ],
    ...DEFAULT_SCORING_BASELINE,
  },

  pitchAngles: {
    NIGERIA: [
      {
        id: "review_led",
        hook: "Fix the friction users already told you about — start with three quick wins.",
        whenToUse: {
          signals: ["app_reviews_usability_complaints"],
          findingChecks: ["uiux.app_reviews"],
        },
        proofTags: ["research"],
        avoidPhrases: ["your users are wrong"],
      },
      {
        id: "onboarding_flow",
        hook: "Sign-up in fewer steps, with clearer feedback at each field.",
        whenToUse: {
          signals: ["high_friction_signup"],
          findingChecks: ["uiux.onboarding_capture"],
        },
        proofTags: ["flow"],
        avoidPhrases: [],
      },
      {
        id: "design_system_lite",
        hook: "A small design system that keeps two teams shipping consistently.",
        whenToUse: { signals: ["inconsistent_ui"], findingChecks: ["uiux.heuristics"] },
        proofTags: ["design-system"],
        avoidPhrases: [],
      },
    ],
    INTERNATIONAL: [
      {
        id: "timezone_overlap",
        hook: "A design team in Lagos working your UK hours — with weekly demos and clear scope.",
        whenToUse: { signals: [], findingChecks: [] },
        proofTags: ["process"],
        avoidPhrases: ["cheap", "offshore"],
      },
      {
        id: "accessibility_lift",
        hook: "Fix AA-blocking accessibility issues before your next release.",
        whenToUse: {
          signals: ["accessibility_failures"],
          findingChecks: ["uiux.accessibility"],
        },
        proofTags: ["accessibility"],
        avoidPhrases: [],
      },
      {
        id: "post_funding_capacity",
        hook: "Add design capacity while you hire, without slowing the roadmap.",
        whenToUse: { signals: ["recently_funded", "job_post_product_designer"], findingChecks: [] },
        proofTags: ["retainer"],
        avoidPhrases: [],
      },
    ],
  },

  portfolio: [
    {
      id: "todo_uiux_case_1",
      title: "TODO: real FUTUREUNI UI/UX case study",
      description: "Placeholder until real work is added.",
      tags: ["flow", "research"],
      markets: ["NIGERIA", "INTERNATIONAL"],
      isPlaceholder: true,
    },
  ],

  pricing: {
    needsReview: true,
    packages: [
      {
        id: "uiux_audit",
        name: "UX audit",
        includes: ["Heuristic review", "3 flow captures", "Priority issue list", "1-page report"],
        timelineWeeks: { min: 2, max: 3 },
        prices: [
          {
            market: "NIGERIA",
            currency: "NGN",
            minMinor: 50_000_000, // ₦500k placeholder
            typicalMinor: 80_000_000,
            maxMinor: 120_000_000,
          },
          {
            market: "INTERNATIONAL",
            currency: "USD",
            minMinor: 150_000, // $1,500 placeholder
            typicalMinor: 250_000,
            maxMinor: 400_000,
          },
          {
            market: "INTERNATIONAL",
            currency: "GBP",
            minMinor: 120_000,
            typicalMinor: 200_000,
            maxMinor: 320_000,
          },
        ],
      },
      {
        id: "redesign_flow",
        name: "Flow redesign",
        includes: ["Research", "IA + wireframes", "Hi-fi mockups", "Prototype"],
        timelineWeeks: { min: 4, max: 8 },
        prices: [
          {
            market: "NIGERIA",
            currency: "NGN",
            minMinor: 150_000_000,
            typicalMinor: 250_000_000,
            maxMinor: 450_000_000,
          },
          {
            market: "INTERNATIONAL",
            currency: "USD",
            minMinor: 350_000,
            typicalMinor: 600_000,
            maxMinor: 1_000_000,
          },
          {
            market: "INTERNATIONAL",
            currency: "GBP",
            minMinor: 280_000,
            typicalMinor: 500_000,
            maxMinor: 850_000,
          },
        ],
      },
    ],
  },

  sequences: {
    NIGERIA: [
      {
        id: "ng_default",
        name: "WhatsApp first, then email",
        isDefault: true,
        steps: ngWhatsAppFirstEmail({
          intro: "review_led",
          valueAdd: "onboarding_flow",
          portfolio: "design_system_lite",
          softBreakup: "onboarding_flow",
        }),
      },
    ],
    INTERNATIONAL: [
      {
        id: "intl_default",
        name: "Email first with a LinkedIn touch",
        isDefault: true,
        steps: intlEmailFirstLinkedInFollow({
          intro: "accessibility_lift",
          followUp: "timezone_overlap",
          valueAdd: "post_funding_capacity",
          softBreakup: "timezone_overlap",
        }),
      },
    ],
  },

  disqualifiers: [...COMMON_DISQUALIFIERS],
  approvalMode: COMMON_APPROVAL_MODE,
  capacityPolicy: COMMON_CAPACITY_POLICY,
};
