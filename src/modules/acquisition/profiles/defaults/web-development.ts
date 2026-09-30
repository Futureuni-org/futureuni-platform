import "server-only";

/**
 * Web Development default profile (module spec §3.3.1). Every price is a placeholder pending
 * Prince's confirmation (see phases/07/SUMMARY.md "For Prince to confirm"), so
 * `pricing.needsReview: true`. Portfolio items are placeholders (INV-19).
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

export const webDevelopmentDefaultProfile: ServiceLineProfile = {
  schemaVersion: 1,
  id: "WEB_DEVELOPMENT",
  label: "Web Development",
  description:
    "Websites, storefronts and web apps for businesses that need to be found, trusted and used online.",
  owners: { roles: ["SERVICE_LEAD"], userIds: [] },
  contactRolePriority: [
    "owner",
    "founder",
    "operations manager",
    "marketing manager",
    "general manager",
  ],

  // ---- Signals ----
  signals: [
    {
      id: "no_website",
      label: "No real website",
      description:
        "Only a Places, Instagram, Facebook or Jiji listing — no proper website URL on record.",
      weight: 30,
      markets: ["NIGERIA", "INTERNATIONAL"],
      evidenceRequired: "Places listing with no website field, or website resolves to a social page.",
      detectingSources: ["google-places"],
      confirmedBy: ["web.no_website"],
      future: false,
    },
    {
      id: "ecommerce_on_social_only",
      label: "Selling through DMs",
      description: "Business sells products through Instagram/Facebook DMs rather than a storefront.",
      weight: 15,
      markets: ["NIGERIA", "INTERNATIONAL"],
      evidenceRequired: "Places listing shows an Instagram/Facebook link and no checkout page.",
      detectingSources: ["google-places"],
      confirmedBy: [],
      future: false,
    },
    {
      id: "slow_mobile",
      label: "Slow on mobile",
      description: "Homepage takes several seconds to render on mobile.",
      weight: 20,
      markets: ["NIGERIA", "INTERNATIONAL"],
      evidenceRequired: "PageSpeed mobile LCP > 4s or performance score < 50.",
      detectingSources: [],
      confirmedBy: ["web.pagespeed_mobile"],
      derivedFrom: "audit",
      future: false,
    },
    {
      id: "no_ssl",
      label: "No TLS",
      description: "Site loads over http only, or certificate is invalid.",
      weight: 25,
      markets: ["NIGERIA", "INTERNATIONAL"],
      evidenceRequired: "Site fails TLS handshake or serves mixed content.",
      detectingSources: [],
      confirmedBy: ["web.ssl"],
      derivedFrom: "audit",
      future: false,
    },
    {
      id: "not_mobile_friendly",
      label: "Not mobile friendly",
      description: "Missing viewport meta or a broken small-screen layout.",
      weight: 15,
      markets: ["NIGERIA", "INTERNATIONAL"],
      evidenceRequired: "No <meta viewport> or CSS layout overflows at 375px.",
      detectingSources: [],
      confirmedBy: ["web.mobile_viewport"],
      derivedFrom: "audit",
      future: false,
    },
    {
      id: "outdated_site",
      label: "Outdated site",
      description: "Old copyright year or legacy tech stack still in the footer.",
      weight: 10,
      markets: ["NIGERIA", "INTERNATIONAL"],
      evidenceRequired: "Footer copyright < current year − 2, or legacy platform strings.",
      detectingSources: [],
      confirmedBy: ["web.outdated"],
      derivedFrom: "audit",
      future: false,
    },
    {
      id: "broken_pages",
      label: "Broken pages",
      description: "Navigation links return 404/5xx.",
      weight: 15,
      markets: ["NIGERIA", "INTERNATIONAL"],
      evidenceRequired: "Broken-links checker reports ≥ 3 dead links.",
      detectingSources: [],
      confirmedBy: ["web.broken_links"],
      derivedFrom: "audit",
      future: false,
    },
    {
      id: "weak_seo_basics",
      label: "Weak SEO basics",
      description: "Missing titles, meta descriptions, H1 or robots controls.",
      weight: 10,
      markets: ["NIGERIA", "INTERNATIONAL"],
      evidenceRequired: "SEO-basics audit flags 3+ misses.",
      detectingSources: [],
      confirmedBy: ["web.seo_basics"],
      derivedFrom: "audit",
      future: false,
    },
    {
      id: "job_post_web_developer",
      label: "Hiring a web developer",
      description: "Public job post for a web developer within the last 90 days.",
      weight: 20,
      markets: ["NIGERIA", "INTERNATIONAL"],
      evidenceRequired: "Job title matches /web developer/i on a job board.",
      detectingSources: ["jobs-serpapi", "jobs-adzuna", "myjobmag"],
      confirmedBy: [],
      future: false,
    },
  ],

  // ---- Sources ----
  sources: [
    {
      adapterId: "google-places",
      markets: ["NIGERIA", "INTERNATIONAL"],
      enabled: true,
      optional: false,
      defaultParams: {
        NIGERIA: {
          placeTypes: ["restaurant", "school", "clinic", "hotel", "real_estate_agency"],
          cities: ["Lagos", "Abuja", "Port Harcourt", "Warri", "Benin City"],
        },
        INTERNATIONAL: {
          placeTypes: ["restaurant", "clinic", "boutique"],
          cities: ["London", "Manchester", "Bristol", "Austin", "Chicago"],
        },
      },
    },
    {
      adapterId: "jobs-serpapi",
      markets: ["NIGERIA", "INTERNATIONAL"],
      enabled: true,
      optional: false,
      defaultParams: {
        NIGERIA: { jobTitles: ["web developer", "frontend developer"], location: "Nigeria" },
        INTERNATIONAL: {
          jobTitles: ["web developer", "frontend developer"],
          location: "United Kingdom",
        },
      },
    },
    {
      adapterId: "jobs-adzuna",
      markets: ["INTERNATIONAL"],
      enabled: false,
      optional: true,
      defaultParams: {
        INTERNATIONAL: {
          jobTitles: ["web developer", "frontend developer"],
          country: "gb",
        },
      },
    },
    {
      adapterId: "myjobmag",
      markets: ["NIGERIA"],
      enabled: false,
      optional: true,
      defaultParams: {
        NIGERIA: { jobTitles: ["web developer", "frontend developer"] },
      },
    },
  ],

  // ---- Audits ----
  audits: [
    {
      agentId: "audit.web",
      checks: [
        { checkId: "web.no_website", required: false },
        { checkId: "web.pagespeed_mobile", required: true },
        { checkId: "web.pagespeed_desktop", required: false },
        { checkId: "web.ssl", required: true },
        { checkId: "web.mobile_viewport", required: true },
        { checkId: "web.broken_links", required: false },
        { checkId: "web.seo_basics", required: false },
        { checkId: "web.outdated", required: false },
        { checkId: "web.contact_path", required: false },
        { checkId: "web.visual_first_impression", required: false },
      ],
    },
  ],

  // ---- Scoring ----
  scoring: {
    rules: [
      ...COMMON_POSITIVE_RULES,
      ...COMMON_NEGATIVE_RULES,
      {
        id: "has_no_website",
        label: "No website on Google Maps",
        condition: { all: [{ kind: "signal", signalId: "no_website", negate: false }] },
        points: 30,
      },
      {
        id: "slow_mobile_high_severity",
        label: "Slow on mobile (measured)",
        condition: {
          all: [
            {
              kind: "finding",
              checkId: "web.pagespeed_mobile",
              minSeverity: "MEDIUM",
              pitchableOnly: true,
              negate: false,
            },
          ],
        },
        points: 20,
      },
      {
        id: "ssl_missing",
        label: "Missing TLS",
        condition: { all: [{ kind: "signal", signalId: "no_ssl", negate: false }] },
        points: 25,
      },
      {
        id: "hiring_developer",
        label: "Hiring a web developer",
        condition: {
          all: [{ kind: "signal", signalId: "job_post_web_developer", negate: false }],
        },
        points: 15,
      },
      {
        id: "ecommerce_dms",
        label: "Selling through DMs",
        condition: {
          all: [{ kind: "signal", signalId: "ecommerce_on_social_only", negate: false }],
        },
        points: 10,
      },
    ],
    ...DEFAULT_SCORING_BASELINE,
  },

  // ---- Pitch angles ----
  pitchAngles: {
    NIGERIA: [
      {
        id: "found_and_trusted",
        hook: "Customers search on their phones — a real site makes you findable and trusted.",
        whenToUse: { signals: ["no_website"], findingChecks: ["web.no_website"] },
        proofTags: ["small-business", "storefront"],
        avoidPhrases: ["your Instagram is bad"],
      },
      {
        id: "faster_pages",
        hook: "Pages that load quickly on Nigerian mobile data keep visitors from bouncing.",
        whenToUse: { signals: ["slow_mobile"], findingChecks: ["web.pagespeed_mobile"] },
        proofTags: ["performance"],
        avoidPhrases: ["your site is slow"],
      },
      {
        id: "safe_and_modern",
        hook: "A modern, secured site sends the signal that you're open for business.",
        whenToUse: { signals: ["no_ssl", "outdated_site"], findingChecks: ["web.ssl", "web.outdated"] },
        proofTags: ["security"],
        avoidPhrases: [],
      },
      {
        id: "handoff_from_dms",
        hook: "Move orders from DMs to a checkout page — fewer missed sales and cleaner records.",
        whenToUse: { signals: ["ecommerce_on_social_only"], findingChecks: [] },
        proofTags: ["storefront"],
        avoidPhrases: [],
      },
    ],
    INTERNATIONAL: [
      {
        id: "timezone_overlap",
        hook: "A Lagos team that works your UK/EU hours, with clear scope and weekly demos.",
        whenToUse: { signals: [], findingChecks: [] },
        proofTags: ["process", "retainer"],
        avoidPhrases: ["cheap", "offshore"],
      },
      {
        id: "performance_matters",
        hook: "Faster mobile pages, measurable in your Search Console.",
        whenToUse: { signals: ["slow_mobile"], findingChecks: ["web.pagespeed_mobile"] },
        proofTags: ["performance"],
        avoidPhrases: [],
      },
      {
        id: "capacity_when_hiring",
        hook: "Backfill capacity while your hire ramps up.",
        whenToUse: { signals: ["job_post_web_developer"], findingChecks: [] },
        proofTags: ["retainer"],
        avoidPhrases: [],
      },
    ],
  },

  // ---- Portfolio (placeholders — Prince to replace) ----
  portfolio: [
    {
      id: "todo_ng_storefront_case",
      title: "TODO: real FUTUREUNI Nigerian storefront project",
      description: "Placeholder until real work is added.",
      tags: ["storefront", "small-business"],
      markets: ["NIGERIA"],
      isPlaceholder: true,
    },
    {
      id: "todo_intl_performance_case",
      title: "TODO: real FUTUREUNI performance case study",
      description: "Placeholder until real work is added.",
      tags: ["performance", "process"],
      markets: ["INTERNATIONAL"],
      isPlaceholder: true,
    },
  ],

  // ---- Pricing (placeholders — Prince to confirm) ----
  pricing: {
    needsReview: true,
    packages: [
      {
        id: "starter_site",
        name: "Starter site",
        includes: ["Up to 5 pages", "Mobile-first design", "Contact form", "Basic SEO"],
        timelineWeeks: { min: 3, max: 5 },
        prices: [
          {
            market: "NIGERIA",
            currency: "NGN",
            minMinor: 80_000_000, // ₦800k placeholder
            typicalMinor: 120_000_000, // ₦1.2M placeholder
            maxMinor: 200_000_000, // ₦2M placeholder
          },
          {
            market: "INTERNATIONAL",
            currency: "USD",
            minMinor: 180_000, // $1,800 placeholder
            typicalMinor: 280_000, // $2,800 placeholder
            maxMinor: 400_000, // $4,000 placeholder
          },
          {
            market: "INTERNATIONAL",
            currency: "GBP",
            minMinor: 150_000, // £1,500 placeholder
            typicalMinor: 220_000, // £2,200 placeholder
            maxMinor: 350_000, // £3,500 placeholder
          },
        ],
      },
      {
        id: "growth_site",
        name: "Growth site",
        includes: [
          "Up to 10 pages",
          "Custom design system",
          "Blog / content sections",
          "SEO + analytics setup",
        ],
        timelineWeeks: { min: 5, max: 8 },
        prices: [
          {
            market: "NIGERIA",
            currency: "NGN",
            minMinor: 200_000_000,
            typicalMinor: 300_000_000,
            maxMinor: 500_000_000,
          },
          {
            market: "INTERNATIONAL",
            currency: "USD",
            minMinor: 400_000,
            typicalMinor: 650_000,
            maxMinor: 1_000_000,
          },
          {
            market: "INTERNATIONAL",
            currency: "GBP",
            minMinor: 350_000,
            typicalMinor: 550_000,
            maxMinor: 900_000,
          },
        ],
      },
      {
        id: "ecommerce_starter",
        name: "Ecommerce starter",
        includes: [
          "Product catalogue",
          "Cart + checkout",
          "Payment integration",
          "Order-management basics",
        ],
        timelineWeeks: { min: 6, max: 10 },
        prices: [
          {
            market: "NIGERIA",
            currency: "NGN",
            minMinor: 250_000_000,
            typicalMinor: 400_000_000,
            maxMinor: 700_000_000,
          },
          {
            market: "INTERNATIONAL",
            currency: "USD",
            minMinor: 500_000,
            typicalMinor: 850_000,
            maxMinor: 1_500_000,
          },
          {
            market: "INTERNATIONAL",
            currency: "GBP",
            minMinor: 400_000,
            typicalMinor: 700_000,
            maxMinor: 1_200_000,
          },
        ],
      },
    ],
  },

  // ---- Sequences ----
  sequences: {
    NIGERIA: [
      {
        id: "ng_default",
        name: "WhatsApp first, then email",
        isDefault: true,
        steps: ngWhatsAppFirstEmail({
          intro: "found_and_trusted",
          valueAdd: "faster_pages",
          portfolio: "safe_and_modern",
          softBreakup: "handoff_from_dms",
        }),
      },
    ],
    INTERNATIONAL: [
      {
        id: "intl_default",
        name: "Email first with a LinkedIn touch",
        isDefault: true,
        steps: intlEmailFirstLinkedInFollow({
          intro: "performance_matters",
          followUp: "timezone_overlap",
          valueAdd: "capacity_when_hiring",
          softBreakup: "timezone_overlap",
        }),
      },
    ],
  },

  // ---- Disqualifiers ----
  disqualifiers: [...COMMON_DISQUALIFIERS],

  approvalMode: COMMON_APPROVAL_MODE,
  capacityPolicy: COMMON_CAPACITY_POLICY,
};
