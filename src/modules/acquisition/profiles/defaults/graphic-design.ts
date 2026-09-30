import "server-only";

/**
 * Graphic Design default profile (module spec §3.3.3). All prices placeholders,
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

export const graphicDesignDefaultProfile: ServiceLineProfile = {
  schemaVersion: 1,
  id: "GRAPHIC_DESIGN",
  label: "Graphic Design",
  description:
    "Visual identity, brand systems and print/digital design for businesses that need a coherent look.",
  owners: { roles: ["SERVICE_LEAD"], userIds: [] },
  contactRolePriority: [
    "founder",
    "owner",
    "marketing manager",
    "operations manager",
    "brand manager",
  ],

  signals: [
    {
      id: "inconsistent_branding",
      label: "Inconsistent branding across surfaces",
      description: "Logo, colours or type differ between website and social channels.",
      weight: 25,
      markets: ["NIGERIA", "INTERNATIONAL"],
      evidenceRequired: "Captured surfaces show 3+ mismatches (logo variants, palette, type).",
      detectingSources: [],
      confirmedBy: ["graphic.consistency", "graphic.brand_surfaces"],
      derivedFrom: "audit",
      future: false,
    },
    {
      id: "low_quality_visuals",
      label: "Low-quality visuals",
      description: "Pixelated logos or stretched images on public surfaces.",
      weight: 15,
      markets: ["NIGERIA", "INTERNATIONAL"],
      evidenceRequired: "Captured logo shows visible pixellation or artefacts.",
      detectingSources: [],
      confirmedBy: ["graphic.logo_quality"],
      derivedFrom: "audit",
      future: false,
    },
    {
      id: "no_brand_system",
      label: "No brand system",
      description: "No consistent palette, typography or spacing rules across surfaces.",
      weight: 20,
      markets: ["NIGERIA", "INTERNATIONAL"],
      evidenceRequired: "Heuristic audit shows no repeated palette or type across three surfaces.",
      detectingSources: [],
      confirmedBy: ["graphic.consistency"],
      derivedFrom: "audit",
      future: false,
    },
    {
      id: "new_business",
      label: "New business",
      description: "Business registered or opened within the last 12 months.",
      weight: 10,
      markets: ["NIGERIA", "INTERNATIONAL"],
      evidenceRequired: "Places listing shows a recent opened_at, or a fresh domain.",
      detectingSources: ["google-places"],
      confirmedBy: [],
      future: false,
    },
    {
      id: "weak_ad_creatives",
      label: "Weak paid ad creatives",
      description: "Low-effort static ads with unclear hierarchy on the ad library.",
      weight: 15,
      markets: ["NIGERIA", "INTERNATIONAL"],
      evidenceRequired: "Meta Ad Library sample shows low-effort creatives (no detector yet).",
      detectingSources: [],
      confirmedBy: [],
      future: true,
    },
    {
      id: "job_post_graphic_designer",
      label: "Hiring a graphic designer",
      description: "Public job post for a graphic designer within the last 90 days.",
      weight: 15,
      markets: ["NIGERIA", "INTERNATIONAL"],
      evidenceRequired: "Job title matches /graphic designer/i on a job board.",
      detectingSources: ["jobs-serpapi", "jobs-adzuna", "myjobmag"],
      confirmedBy: [],
      future: false,
    },
  ],

  sources: [
    {
      adapterId: "google-places",
      markets: ["NIGERIA", "INTERNATIONAL"],
      enabled: true,
      optional: false,
      defaultParams: {
        NIGERIA: {
          placeTypes: ["restaurant", "clothing_store", "beauty_salon"],
          cities: ["Lagos", "Abuja", "Port Harcourt"],
        },
        INTERNATIONAL: {
          placeTypes: ["restaurant", "boutique", "salon"],
          cities: ["London", "Manchester", "Bristol"],
        },
      },
    },
    {
      adapterId: "jobs-serpapi",
      markets: ["NIGERIA", "INTERNATIONAL"],
      enabled: true,
      optional: false,
      defaultParams: {
        NIGERIA: { jobTitles: ["graphic designer", "brand designer"], location: "Nigeria" },
        INTERNATIONAL: {
          jobTitles: ["graphic designer", "brand designer"],
          location: "United Kingdom",
        },
      },
    },
  ],

  audits: [
    {
      agentId: "audit.graphic",
      checks: [
        { checkId: "graphic.brand_surfaces", required: true },
        { checkId: "graphic.consistency", required: true },
        { checkId: "graphic.logo_quality", required: false },
        { checkId: "graphic.social_presence_fit", required: false },
      ],
    },
  ],

  scoring: {
    rules: [
      ...COMMON_POSITIVE_RULES,
      ...COMMON_NEGATIVE_RULES,
      {
        id: "branding_inconsistent",
        label: "Inconsistent branding",
        condition: { all: [{ kind: "signal", signalId: "inconsistent_branding", negate: false }] },
        points: 25,
      },
      {
        id: "no_system",
        label: "No brand system",
        condition: { all: [{ kind: "signal", signalId: "no_brand_system", negate: false }] },
        points: 20,
      },
      {
        id: "new_business_bonus",
        label: "New business",
        condition: { all: [{ kind: "signal", signalId: "new_business", negate: false }] },
        points: 10,
      },
      {
        id: "hiring_graphic_designer",
        label: "Hiring a graphic designer",
        condition: {
          all: [{ kind: "signal", signalId: "job_post_graphic_designer", negate: false }],
        },
        points: 10,
      },
    ],
    ...DEFAULT_SCORING_BASELINE,
  },

  pitchAngles: {
    NIGERIA: [
      {
        id: "coherent_brand",
        hook: "One brand system across your site and socials — so customers recognise you.",
        whenToUse: {
          signals: ["inconsistent_branding", "no_brand_system"],
          findingChecks: ["graphic.consistency", "graphic.brand_surfaces"],
        },
        proofTags: ["brand-system"],
        avoidPhrases: ["your brand is ugly"],
      },
      {
        id: "sharp_visuals",
        hook: "Clean, sharp visuals that print and post without artefacts.",
        whenToUse: { signals: ["low_quality_visuals"], findingChecks: ["graphic.logo_quality"] },
        proofTags: ["visual-quality"],
        avoidPhrases: [],
      },
      {
        id: "launch_pack",
        hook: "A launch pack for new businesses — logo, colours, type, socials.",
        whenToUse: { signals: ["new_business"], findingChecks: [] },
        proofTags: ["launch-pack"],
        avoidPhrases: [],
      },
    ],
    INTERNATIONAL: [
      {
        id: "brand_refresh",
        hook: "A brand refresh that reads clearly on every surface.",
        whenToUse: {
          signals: ["inconsistent_branding"],
          findingChecks: ["graphic.consistency"],
        },
        proofTags: ["brand-system"],
        avoidPhrases: [],
      },
      {
        id: "system_over_one_offs",
        hook: "A design system that stops one-off asset requests eating your marketing team.",
        whenToUse: { signals: ["no_brand_system"], findingChecks: ["graphic.consistency"] },
        proofTags: ["design-system"],
        avoidPhrases: [],
      },
      {
        id: "campaign_ready_assets",
        hook: "Campaign-ready assets for your next launch, delivered in your team's tools.",
        whenToUse: {
          signals: ["job_post_graphic_designer"],
          findingChecks: [],
        },
        proofTags: ["campaign"],
        avoidPhrases: [],
      },
    ],
  },

  portfolio: [
    {
      id: "todo_graphic_case_1",
      title: "TODO: real FUTUREUNI graphic design case",
      description: "Placeholder until real work is added.",
      tags: ["brand-system", "visual-quality"],
      markets: ["NIGERIA", "INTERNATIONAL"],
      isPlaceholder: true,
    },
  ],

  pricing: {
    needsReview: true,
    packages: [
      {
        id: "logo_and_basics",
        name: "Logo and basics",
        includes: ["Logo", "Colour palette", "Type pairing", "1-page style guide"],
        timelineWeeks: { min: 2, max: 3 },
        prices: [
          {
            market: "NIGERIA",
            currency: "NGN",
            minMinor: 30_000_000,
            typicalMinor: 50_000_000,
            maxMinor: 80_000_000,
          },
          {
            market: "INTERNATIONAL",
            currency: "USD",
            minMinor: 100_000,
            typicalMinor: 180_000,
            maxMinor: 300_000,
          },
          {
            market: "INTERNATIONAL",
            currency: "GBP",
            minMinor: 80_000,
            typicalMinor: 150_000,
            maxMinor: 240_000,
          },
        ],
      },
      {
        id: "brand_system",
        name: "Brand system",
        includes: ["Logo suite", "Full palette + type scale", "Social templates", "Guide"],
        timelineWeeks: { min: 4, max: 6 },
        prices: [
          {
            market: "NIGERIA",
            currency: "NGN",
            minMinor: 80_000_000,
            typicalMinor: 150_000_000,
            maxMinor: 250_000_000,
          },
          {
            market: "INTERNATIONAL",
            currency: "USD",
            minMinor: 250_000,
            typicalMinor: 450_000,
            maxMinor: 750_000,
          },
          {
            market: "INTERNATIONAL",
            currency: "GBP",
            minMinor: 200_000,
            typicalMinor: 380_000,
            maxMinor: 620_000,
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
          intro: "coherent_brand",
          valueAdd: "sharp_visuals",
          portfolio: "launch_pack",
          softBreakup: "coherent_brand",
        }),
      },
    ],
    INTERNATIONAL: [
      {
        id: "intl_default",
        name: "Email first with a LinkedIn touch",
        isDefault: true,
        steps: intlEmailFirstLinkedInFollow({
          intro: "brand_refresh",
          followUp: "system_over_one_offs",
          valueAdd: "campaign_ready_assets",
          softBreakup: "brand_refresh",
        }),
      },
    ],
  },

  disqualifiers: [...COMMON_DISQUALIFIERS],
  approvalMode: COMMON_APPROVAL_MODE,
  capacityPolicy: COMMON_CAPACITY_POLICY,
};
