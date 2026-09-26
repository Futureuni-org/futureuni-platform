/**
 * The four initial service-line profiles (docs/specs/module-acquisition.md §3.3), as the seed's
 * version-1 placeholders (note "seed:placeholder"). Phase 7 owns the real defaults in
 * src/modules/acquisition/profiles/defaults/ and may replace these (data-model §10.3).
 *
 * Every price is a placeholder for Prince to confirm (pricing.needsReview: true), and so is every
 * package timeline (§3.3 gives none). Portfolio items are placeholders (INV-19): never sent.
 */

import {
  SEQUENCE_STOP_CONDITIONS,
  type Condition,
  type ServiceLine,
  type ServiceLineProfile,
} from "@/contracts";

type Profile = ServiceLineProfile;
type Market = "NIGERIA" | "INTERNATIONAL";

const BOTH: Market[] = ["NIGERIA", "INTERNATIONAL"];
const STOP = [...SEQUENCE_STOP_CONDITIONS];

// ---- Conditions (the §3.3 grammar as the contract's AST) ----
const signal = (signalId: string): Condition => ({
  all: [{ kind: "signal", signalId, negate: false }],
});
const finding = (
  checkId: Profile["audits"][number]["checks"][number]["checkId"],
  minSeverity: "MEDIUM" | "HIGH",
): Condition => ({
  all: [{ kind: "finding", checkId, minSeverity, pitchableOnly: false, negate: false }],
});

/** Common to all four lines (§3.3). */
const COMMON_RULES: Profile["scoring"]["rules"] = [
  {
    id: "common_reachable_contact",
    label: "We can reach a named contact",
    condition: {
      all: [{ kind: "field", field: "contact.primary.emailStatus", op: "eq", value: "VALID" }],
    },
    points: 10,
  },
  {
    id: "common_ng_whatsapp",
    label: "Reachable on WhatsApp in Nigeria",
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
    id: "common_legal_form_known",
    label: "Legal form known",
    condition: {
      all: [{ kind: "field", field: "company.legalForm", op: "neq", value: "UNKNOWN" }],
    },
    points: 3,
  },
  {
    id: "common_role_email_only",
    label: "Only a generic inbox found",
    condition: {
      all: [{ kind: "field", field: "contact.primary.emailType", op: "eq", value: "ROLE" }],
    },
    points: -5,
  },
  {
    id: "common_large_company",
    label: "Large company",
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

const COMMON_DISQUALIFIERS: Profile["disqualifiers"] = [
  {
    id: "competitor_agency",
    label: "Competitor agency",
    description: "The company sells the same service.",
    aiReviewHint: "The company itself offers this service to clients.",
  },
  {
    id: "government_body",
    label: "Government body",
    description: "A ministry, agency or other public body.",
    condition: {
      all: [{ kind: "field", field: "company.legalForm", op: "eq", value: "PUBLIC_BODY" }],
    },
    aiReviewHint: "A government ministry, agency or public body.",
  },
  {
    id: "adult_or_gambling",
    label: "Adult or gambling business",
    description: "Adult content, betting or gambling.",
    aiReviewHint: "The business is adult entertainment, betting or gambling.",
  },
  {
    id: "active_client",
    label: "Already a client",
    description: "Company is an active FUTUREUNI client.",
    condition: { all: [{ kind: "field", field: "company.isActiveClient", op: "eq", value: true }] },
  },
  {
    id: "no_channel",
    label: "No way to reach them",
    description: "Email is blocked and no WhatsApp, LinkedIn or phone channel is allowed.",
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
    description: "Job posts for 3 or more roles of this line within 90 days, or 1,000+ staff.",
    condition: {
      all: [{ kind: "field", field: "company.sizeRange", op: "eq", value: "SIZE_1000_PLUS" }],
    },
    aiReviewHint: "Three or more job posts for this line's roles within 90 days.",
  },
];

const CAPACITY_POLICY: Profile["capacityPolicy"] = {
  slowAtPercent: 70,
  pauseAtPercent: 100,
  slowFactor: 0.3,
  pauseScheduledSearches: true,
  newQualifiedLeadsWhenPaused: "NURTURE",
};

// ---- Sequences: the same shape for every line (§3.3.1) ----
function sequences(line: string): Profile["sequences"] {
  const step = (
    index: number,
    channel: "EMAIL" | "WHATSAPP_ASSISTED" | "LINKEDIN_ASSISTED",
    delayBusinessDays: number,
    purpose: "INTRO_AUDIT_INSIGHT" | "VALUE_ADD" | "PORTFOLIO_PROOF" | "SOFT_BREAKUP",
    includeBookingLink = false,
  ) => ({ index, channel, delayBusinessDays, purpose, includeBookingLink, stopConditions: STOP });
  return {
    NIGERIA: [
      {
        id: `ng_${line}_default`,
        name: "WhatsApp first",
        isDefault: true,
        steps: [
          step(0, "WHATSAPP_ASSISTED", 0, "INTRO_AUDIT_INSIGHT"),
          step(1, "EMAIL", 3, "VALUE_ADD"),
          step(2, "WHATSAPP_ASSISTED", 4, "PORTFOLIO_PROOF", true),
          step(3, "EMAIL", 7, "SOFT_BREAKUP"),
        ],
      },
    ],
    INTERNATIONAL: [
      {
        id: `intl_${line}_default`,
        name: "Email first",
        isDefault: true,
        steps: [
          step(0, "EMAIL", 0, "INTRO_AUDIT_INSIGHT"),
          step(1, "EMAIL", 3, "VALUE_ADD"),
          step(2, "LINKEDIN_ASSISTED", 2, "PORTFOLIO_PROOF"),
          step(3, "EMAIL", 4, "PORTFOLIO_PROOF", true),
          step(4, "EMAIL", 7, "SOFT_BREAKUP"),
        ],
      },
    ],
  };
}

// ---- Pricing: ranges in major units, stored as minor units (×100); typical = midpoint ----
function prices(ngn: [number, number], usd: [number, number], gbp: [number, number]) {
  const range = (
    market: Market,
    currency: "NGN" | "USD" | "GBP",
    [min, max]: [number, number],
  ) => ({
    market,
    currency,
    minMinor: min * 100,
    typicalMinor: Math.floor((min + max) / 2) * 100,
    maxMinor: max * 100,
  });
  return [
    range("NIGERIA", "NGN", ngn),
    range("INTERNATIONAL", "USD", usd),
    range("INTERNATIONAL", "GBP", gbp),
  ];
}

function placeholderPortfolio(line: string, tags: string[]): Profile["portfolio"] {
  return [
    {
      id: `todo_${line}_project`,
      title: "TODO: real FUTUREUNI project",
      description:
        "Placeholder until real FUTUREUNI work is added. Never attached to outreach or proposals (INV-19).",
      tags,
      markets: BOTH,
      isPlaceholder: true,
    },
  ];
}

const angle = (
  id: string,
  hook: string,
  signals: string[],
  proofTags: string[],
  avoidPhrases: string[] = [],
) => ({ id, hook, whenToUse: { signals, findingChecks: [] }, proofTags, avoidPhrases });

const JOB_SOURCES = ["jobs-serpapi", "jobs-adzuna", "myjobmag"] as const;
const MANUAL_SOURCES = ["manual", "csv-import"] as const;
const NG_CITIES = ["Lagos", "Abuja", "Port Harcourt", "Warri", "Benin City"];

const csvAndManual: Profile["sources"] = [
  { adapterId: "csv-import", markets: BOTH, enabled: true, optional: false, defaultParams: {} },
  { adapterId: "manual", markets: BOTH, enabled: true, optional: false, defaultParams: {} },
];

/** Jobs sources for a line: SerpApi in both markets, MyJobMag feeds in Nigeria, Adzuna abroad (disabled by default). */
function jobSources(
  titles: string[],
  ngLocations: string[],
  intlLocations: string[],
): Profile["sources"] {
  return [
    {
      adapterId: "jobs-serpapi",
      markets: BOTH,
      enabled: true,
      optional: false,
      defaultParams: {
        NIGERIA: { jobTitles: titles, locations: ngLocations, postedWithinDays: 30 },
        INTERNATIONAL: { jobTitles: titles, locations: intlLocations, postedWithinDays: 30 },
      },
    },
    {
      adapterId: "myjobmag",
      markets: ["NIGERIA"],
      enabled: true,
      optional: true,
      defaultParams: { NIGERIA: { jobTitles: titles } },
    },
    {
      adapterId: "jobs-adzuna",
      markets: ["INTERNATIONAL"],
      enabled: true,
      optional: true,
      defaultParams: { INTERNATIONAL: { jobTitles: titles, countries: ["gb", "us", "ca"] } },
    },
  ];
}

// ---------------------------------------------------------------------------------------------
// 3.3.1 Web Development
// ---------------------------------------------------------------------------------------------
const WEB: Profile = {
  schemaVersion: 1,
  id: "WEB_DEVELOPMENT",
  label: "Web Development",
  description: "Websites that load fast, work on phones, and turn visitors into customers.",
  owners: { roles: ["SERVICE_LEAD"], userIds: [] },
  contactRolePriority: ["owner", "founder", "operations manager", "marketing manager"],
  signals: [
    {
      id: "no_website",
      label: "No website",
      description: "No website, or the website is a social or marketplace page.",
      weight: 25,
      markets: BOTH,
      evidenceRequired:
        "Places listing with no website field, or the website is a social or marketplace URL (instagram.com, facebook.com, jiji.ng, linktr.ee)",
      detectingSources: ["google-places", ...MANUAL_SOURCES],
      confirmedBy: ["web.no_website"],
      future: false,
    },
    derived(
      "slow_mobile",
      "Slow on mobile",
      15,
      "PageSpeed mobile performance score < 50 or LCP > 4.0s",
      "web.pagespeed_mobile",
    ),
    derived(
      "no_ssl",
      "No working HTTPS",
      10,
      "HTTPS unavailable, invalid or expiring certificate, or HTTP doesn't redirect to HTTPS",
      "web.ssl",
    ),
    derived(
      "not_mobile_friendly",
      "Not mobile friendly",
      12,
      "No viewport meta tag, or the mobile capture overflows horizontally",
      "web.mobile_viewport",
    ),
    {
      ...derived(
        "outdated_site",
        "Outdated site",
        10,
        "Copyright year 3+ years old, or legacy tech hints (jQuery < 1.12, Flash, table layouts)",
        "web.outdated",
      ),
      derivedFrom: "enrichment",
    },
    derived(
      "broken_pages",
      "Broken pages",
      8,
      "2 or more of up to 20 internal links return 4xx/5xx",
      "web.broken_links",
    ),
    derived(
      "weak_seo_basics",
      "Weak SEO basics",
      5,
      "Missing title, meta description, single H1 or OG tags",
      "web.seo_basics",
    ),
    jobSignal(
      "job_post_web_developer",
      "Hiring a web developer",
      "Job post in the last 60 days with a title matching web developer, frontend developer, wordpress developer or website developer",
    ),
    {
      id: "ecommerce_on_social_only",
      label: "Selling through DMs",
      description: "Sells through a social profile or Places listing with no own site.",
      weight: 12,
      markets: ["NIGERIA"],
      evidenceRequired:
        '"DM to order", "order on WhatsApp" or a product catalogue on a social profile or Places listing with no own site',
      detectingSources: ["google-places", ...MANUAL_SOURCES],
      confirmedBy: ["web.no_website"],
      future: false,
    },
  ],
  sources: [
    {
      adapterId: "google-places",
      markets: BOTH,
      enabled: true,
      optional: false,
      defaultParams: {
        NIGERIA: {
          cities: NG_CITIES,
          sectors: [
            "restaurants",
            "private clinics",
            "private schools",
            "real estate agencies",
            "hotels",
            "fashion boutiques",
            "logistics companies",
            "event centres",
          ],
          includeChurches: false,
          resultsPerQuery: 20,
        },
        INTERNATIONAL: {
          cities: [
            "London, GB",
            "Manchester, GB",
            "Birmingham, GB",
            "Leeds, GB",
            "Bristol, GB",
            "Dublin, IE",
            "New York, US",
            "Houston, US",
            "Atlanta, US",
            "Toronto, CA",
          ],
          sectors: [
            "independent restaurants",
            "dental clinics",
            "estate agents",
            "law firms",
            "fitness studios",
            "trades",
          ],
          resultsPerQuery: 20,
        },
      },
    },
    ...jobSources(
      ["web developer", "wordpress developer", "frontend developer"],
      ["Nigeria", ...NG_CITIES],
      ["United Kingdom", "Ireland", "United States", "Canada"],
    ),
    ...csvAndManual,
  ],
  audits: [
    {
      agentId: "audit.web",
      checks: [
        { checkId: "web.no_website", required: true },
        { checkId: "web.pagespeed_mobile", required: true },
        { checkId: "web.ssl", required: true },
        { checkId: "web.mobile_viewport", required: true },
        { checkId: "web.pagespeed_desktop", required: false },
        { checkId: "web.broken_links", required: false },
        { checkId: "web.seo_basics", required: false },
        { checkId: "web.outdated", required: false },
        { checkId: "web.contact_path", required: false },
        { checkId: "web.visual_first_impression", required: false },
      ],
    },
  ],
  scoring: {
    rules: [
      { id: "web_no_website", label: "No website", condition: signal("no_website"), points: 30 },
      {
        id: "web_slow_mobile",
        label: "Slow on mobile",
        condition: finding("web.pagespeed_mobile", "HIGH"),
        points: 15,
      },
      {
        id: "web_no_ssl",
        label: "No working HTTPS",
        condition: finding("web.ssl", "MEDIUM"),
        points: 10,
      },
      {
        id: "web_not_mobile",
        label: "Not mobile friendly",
        condition: finding("web.mobile_viewport", "MEDIUM"),
        points: 10,
      },
      { id: "web_outdated", label: "Outdated site", condition: signal("outdated_site"), points: 8 },
      {
        id: "web_broken",
        label: "Broken pages",
        condition: finding("web.broken_links", "MEDIUM"),
        points: 5,
      },
      {
        id: "web_hiring",
        label: "Hiring a web developer",
        condition: signal("job_post_web_developer"),
        points: 15,
      },
      {
        id: "web_social_commerce",
        label: "Selling through DMs",
        condition: signal("ecommerce_on_social_only"),
        points: 10,
      },
      ...COMMON_RULES,
    ],
    qualifyThreshold: 61,
    borderlineBand: { min: 40, max: 60 },
    lowScoreAction: "DISQUALIFY",
  },
  pitchAngles: {
    NIGERIA: [
      angle(
        "ng_web_first_site",
        "Customers search Google before they visit — right now they only find your Instagram.",
        ["no_website"],
        ["website-launch", "local-business"],
        ["your business looks unprofessional"],
      ),
      angle(
        "ng_web_whatsapp_orders",
        "Let customers order and pay online, with WhatsApp kept for questions.",
        ["ecommerce_on_social_only"],
        ["ecommerce", "whatsapp-integration"],
        ["promising sales figures"],
      ),
      angle(
        "ng_web_mobile_data",
        "Most of your visitors are on mobile data — a lighter site loads faster and costs them less.",
        ["slow_mobile", "not_mobile_friendly"],
        ["performance"],
        ["technical jargon (LCP, CLS) in the first message"],
      ),
      angle(
        "ng_web_trust",
        "A secure, up-to-date site builds trust with customers and partners.",
        ["no_ssl", "outdated_site"],
        ["redesign"],
        ["your site is hacked/unsafe"],
      ),
    ],
    INTERNATIONAL: [
      angle(
        "intl_web_speed",
        "Your homepage took {LCP}s to show its main content on mobile in our test on {date}.",
        ["slow_mobile"],
        ["performance", "case-study"],
        ["exaggerating lost revenue"],
      ),
      angle(
        "intl_web_modernise",
        "A fixed-price refresh that works on every phone.",
        ["outdated_site", "not_mobile_friendly"],
        ["redesign"],
        ["your site is terrible"],
      ),
      angle(
        "intl_web_overlap",
        "A senior team in Lagos that works your hours — Lagos shares working hours with the UK and much of Europe.",
        ["job_post_web_developer"],
        ["process", "retainer"],
        ["cheap offshore"],
      ),
      angle(
        "intl_web_first_site",
        "Customers look you up before they call — give them a site that answers their questions.",
        ["no_website"],
        ["website-launch"],
      ),
    ],
  },
  portfolio: placeholderPortfolio("web", [
    "website-launch",
    "local-business",
    "ecommerce",
    "performance",
    "redesign",
    "case-study",
    "process",
    "retainer",
  ]),
  pricing: {
    needsReview: true,
    packages: [
      {
        id: "web_starter",
        name: "Starter site",
        includes: ["Up to 5 responsive pages", "Contact form", "Basic SEO"],
        timelineWeeks: { min: 2, max: 4 },
        prices: prices([450_000, 900_000], [1_500, 3_000], [1_200, 2_500]),
      },
      {
        id: "web_business",
        name: "Business site",
        includes: ["Up to 12 pages", "CMS", "Analytics", "Speed optimisation"],
        timelineWeeks: { min: 4, max: 8 },
        prices: prices([1_200_000, 2_500_000], [3_500, 7_500], [3_000, 6_000]),
      },
      {
        id: "web_ecommerce",
        name: "Online store",
        includes: ["Catalogue", "Checkout", "Payments", "Order emails"],
        timelineWeeks: { min: 6, max: 12 },
        prices: prices([2_000_000, 5_000_000], [6_000, 15_000], [5_000, 12_000]),
      },
      {
        id: "web_care",
        name: "Care plan (monthly)",
        includes: ["Hosting oversight", "Updates", "Small edits"],
        timelineWeeks: { min: 4, max: 4 },
        prices: prices([50_000, 150_000], [150, 400], [120, 320]),
      },
    ],
  },
  sequences: sequences("web"),
  disqualifiers: [
    ...COMMON_DISQUALIFIERS,
    {
      id: "franchise_central_web",
      label: "Franchise with a central website",
      description: "A franchise whose website is managed centrally.",
      aiReviewHint: "A franchise location whose website belongs to the franchisor.",
    },
  ],
  approvalMode: "ALWAYS_REVIEW",
  capacityPolicy: CAPACITY_POLICY,
};

// ---------------------------------------------------------------------------------------------
// 3.3.2 UI/UX Design
// ---------------------------------------------------------------------------------------------
const UIUX: Profile = {
  schemaVersion: 1,
  id: "UI_UX_DESIGN",
  label: "UI/UX Design",
  description: "Product and app design that makes signup, onboarding and everyday use effortless.",
  owners: { roles: ["SERVICE_LEAD"], userIds: [] },
  contactRolePriority: ["founder", "cpo", "cto", "product manager"],
  signals: [
    {
      id: "app_reviews_usability_complaints",
      label: "Users complain about usability",
      description: "Recent App Store reviews mention usability problems.",
      weight: 20,
      markets: BOTH,
      evidenceRequired:
        "3+ of the latest 50 App Store reviews mention confusing navigation, signup/login trouble, can't find, crashes on key flows",
      detectingSources: ["apple-app-store"],
      confirmedBy: ["uiux.app_reviews"],
      future: false,
    },
    {
      id: "app_low_rating",
      label: "Low app rating",
      description: "The app's App Store rating is low.",
      weight: 10,
      markets: BOTH,
      evidenceRequired: "App Store rating < 3.5 with at least 20 ratings",
      detectingSources: ["apple-app-store"],
      confirmedBy: ["uiux.app_reviews"],
      future: false,
    },
    derived(
      "high_friction_signup",
      "High-friction signup",
      15,
      "The onboarding capture reaches signup in 3+ steps or shows 8+ required fields before any value",
      "uiux.onboarding_capture",
    ),
    derived(
      "inconsistent_ui",
      "Inconsistent interface",
      10,
      "A heuristics finding with severity ≥ MEDIUM on consistency or hierarchy",
      "uiux.heuristics",
    ),
    derived(
      "accessibility_failures",
      "Accessibility failures",
      10,
      "axe reports 1+ critical or 5+ serious violations on the landing page",
      "uiux.accessibility",
    ),
    {
      id: "recently_funded",
      label: "Recently funded",
      description: "Raised funding within the last 12 months.",
      weight: 15,
      markets: BOTH,
      evidenceRequired: "A funding announcement within 12 months, with a source URL",
      detectingSources: [...MANUAL_SOURCES],
      confirmedBy: [],
      future: false,
    },
    jobSignal(
      "job_post_product_designer",
      "Hiring a product designer",
      "Job post in the last 60 days matching product designer, UI/UX designer, UX designer or UI designer",
    ),
  ],
  sources: [
    {
      adapterId: "apple-app-store",
      markets: BOTH,
      enabled: true,
      optional: false,
      defaultParams: {
        NIGERIA: {
          countries: ["ng"],
          categories: [
            "finance",
            "shopping",
            "food and drink",
            "health and fitness",
            "education",
            "business",
            "lifestyle",
          ],
          maxRating: 3.8,
          minRatings: 20,
        },
        INTERNATIONAL: {
          countries: ["gb", "us", "ie", "ca"],
          categories: [
            "finance",
            "shopping",
            "food and drink",
            "health and fitness",
            "education",
            "business",
            "lifestyle",
          ],
          maxRating: 3.8,
          minRatings: 20,
        },
      },
    },
    ...jobSources(
      ["product designer", "UI/UX designer"],
      ["Nigeria", "Lagos", "Abuja"],
      ["United Kingdom", "Ireland", "United States", "Canada"],
    ),
    ...csvAndManual,
  ],
  audits: [
    {
      agentId: "audit.uiux",
      checks: [
        { checkId: "uiux.app_reviews", required: true },
        { checkId: "uiux.onboarding_capture", required: true },
        { checkId: "uiux.accessibility", required: true },
        { checkId: "uiux.heuristics", required: false },
        { checkId: "uiux.mobile_layout", required: false },
      ],
    },
  ],
  scoring: {
    rules: [
      {
        id: "uiux_reviews",
        label: "Users complain about usability",
        condition: signal("app_reviews_usability_complaints"),
        points: 20,
      },
      {
        id: "uiux_low_rating",
        label: "Low app rating",
        condition: signal("app_low_rating"),
        points: 8,
      },
      {
        id: "uiux_friction",
        label: "High-friction signup",
        condition: finding("uiux.onboarding_capture", "MEDIUM"),
        points: 15,
      },
      {
        id: "uiux_heuristics",
        label: "Inconsistent interface",
        condition: finding("uiux.heuristics", "MEDIUM"),
        points: 10,
      },
      {
        id: "uiux_a11y",
        label: "Accessibility failures",
        condition: finding("uiux.accessibility", "HIGH"),
        points: 10,
      },
      {
        id: "uiux_funded",
        label: "Recently funded",
        condition: signal("recently_funded"),
        points: 15,
      },
      {
        id: "uiux_hiring",
        label: "Hiring a product designer",
        condition: signal("job_post_product_designer"),
        points: 15,
      },
      ...COMMON_RULES,
    ],
    qualifyThreshold: 61,
    borderlineBand: { min: 40, max: 60 },
    lowScoreAction: "DISQUALIFY",
  },
  pitchAngles: {
    NIGERIA: [
      angle(
        "ng_uiux_reviews",
        "Your app reviews mention the same few frustrations — here's what we'd fix first.",
        ["app_reviews_usability_complaints"],
        ["app-redesign"],
        ["quoting a reviewer's name"],
      ),
      angle(
        "ng_uiux_signup",
        "Fewer steps before the first win means more signups, especially on slow networks.",
        ["high_friction_signup"],
        ["onboarding"],
        ["your app is hard to use"],
      ),
      angle(
        "ng_uiux_trust",
        "Clear, consistent screens build trust — it matters most in finance and health apps.",
        ["inconsistent_ui"],
        ["fintech", "design-system"],
        ["fear-based claims"],
      ),
    ],
    INTERNATIONAL: [
      angle(
        "intl_uiux_reviews",
        "Recent reviews point to {theme} — a focused redesign of that flow is a quick win.",
        ["app_reviews_usability_complaints"],
        ["app-redesign", "case-study"],
      ),
      angle(
        "intl_uiux_onboarding",
        "Your signup takes {steps} steps before users see value — we'd cut it down.",
        ["high_friction_signup"],
        ["onboarding"],
        ["invented conversion numbers"],
      ),
      angle(
        "intl_uiux_post_raise",
        "After a raise, design debt compounds — a design system now saves months later.",
        ["recently_funded"],
        ["design-system"],
        ["congratulating on unverified funding"],
      ),
      angle(
        "intl_uiux_overlap",
        "Senior product designers in Lagos, working your hours.",
        ["job_post_product_designer"],
        ["process", "retainer"],
        ["cheap offshore"],
      ),
    ],
  },
  portfolio: placeholderPortfolio("uiux", [
    "app-redesign",
    "onboarding",
    "fintech",
    "design-system",
    "case-study",
    "process",
    "retainer",
  ]),
  pricing: {
    needsReview: true,
    packages: [
      {
        id: "uiux_audit",
        name: "UX audit",
        includes: ["Heuristic review", "Review analysis", "Prioritised fixes"],
        timelineWeeks: { min: 1, max: 2 },
        prices: prices([350_000, 700_000], [1_200, 2_500], [1_000, 2_000]),
      },
      {
        id: "uiux_flow_redesign",
        name: "Flow redesign",
        includes: ["One critical flow (for example onboarding) redesigned and prototyped"],
        timelineWeeks: { min: 3, max: 6 },
        prices: prices([800_000, 1_800_000], [3_000, 6_000], [2_500, 5_000]),
      },
      {
        id: "uiux_product_design",
        name: "Product design",
        includes: ["MVP or major feature design", "Prototype", "Handoff"],
        timelineWeeks: { min: 8, max: 16 },
        prices: prices([2_000_000, 5_000_000], [8_000, 20_000], [6_500, 16_000]),
      },
      {
        id: "uiux_design_system",
        name: "Design system",
        includes: ["Tokens", "Components", "Documentation"],
        timelineWeeks: { min: 6, max: 12 },
        prices: prices([1_500_000, 4_000_000], [5_000, 12_000], [4_000, 10_000]),
      },
    ],
  },
  sequences: sequences("uiux"),
  disqualifiers: [
    ...COMMON_DISQUALIFIERS,
    {
      id: "large_product_team",
      label: "Large product team",
      description: "3+ design job posts in 90 days, or 201+ staff.",
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
      aiReviewHint: "Three or more design job posts within 90 days.",
    },
  ],
  approvalMode: "ALWAYS_REVIEW",
  capacityPolicy: CAPACITY_POLICY,
};

// ---------------------------------------------------------------------------------------------
// 3.3.3 Graphic Design
// ---------------------------------------------------------------------------------------------
const GRAPHIC: Profile = {
  schemaVersion: 1,
  id: "GRAPHIC_DESIGN",
  label: "Graphic Design",
  description:
    "Brand identities, social graphics and visual systems that look consistent everywhere.",
  owners: { roles: ["SERVICE_LEAD"], userIds: [] },
  contactRolePriority: ["founder", "marketing manager", "brand manager"],
  signals: [
    derived(
      "inconsistent_branding",
      "Inconsistent branding",
      20,
      "Logo, colours or typography differ across the website and public social profiles",
      "graphic.consistency",
    ),
    derived(
      "low_quality_visuals",
      "Low-quality visuals",
      12,
      "Pixelated, stretched or low-resolution logo or hero images",
      "graphic.logo_quality",
    ),
    derived(
      "no_brand_system",
      "No brand system",
      12,
      "No consistent palette or type; generic template visuals",
      "graphic.consistency",
    ),
    {
      id: "new_business",
      label: "New business",
      description: "A business that started recently.",
      weight: 15,
      markets: BOTH,
      evidenceRequired:
        "Places listing with fewer than 10 reviews and first review within 12 months, or a recent registration noted in the source",
      detectingSources: ["google-places", ...MANUAL_SOURCES],
      confirmedBy: [],
      future: false,
    },
    {
      id: "weak_ad_creatives",
      label: "Weak ad creatives",
      description: "Reserved: no compliant data source yet.",
      weight: 0,
      markets: BOTH,
      evidenceRequired: "Reserved: no compliant data source yet; manual entry only",
      detectingSources: ["manual"],
      confirmedBy: [],
      future: true,
    },
    jobSignal(
      "job_post_graphic_designer",
      "Hiring a graphic designer",
      "Job post in the last 60 days matching graphic designer, brand designer or visual designer",
    ),
  ],
  sources: [
    {
      adapterId: "google-places",
      markets: BOTH,
      enabled: true,
      optional: false,
      defaultParams: {
        NIGERIA: {
          cities: NG_CITIES,
          sectors: [
            "fashion brands",
            "beauty salons",
            "restaurants and cafés",
            "event planners",
            "bakeries",
            "real estate",
          ],
          resultsPerQuery: 20,
        },
        INTERNATIONAL: {
          cities: ["London, GB", "Manchester, GB", "Dublin, IE", "New York, US", "Toronto, CA"],
          sectors: ["cafés", "salons", "boutiques", "fitness studios", "independent brands"],
          resultsPerQuery: 20,
        },
      },
    },
    ...jobSources(
      ["graphic designer", "brand designer"],
      ["Nigeria", ...NG_CITIES],
      ["United Kingdom", "Ireland", "United States", "Canada"],
    ),
    ...csvAndManual,
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
      {
        id: "graphic_inconsistent",
        label: "Inconsistent branding",
        condition: finding("graphic.consistency", "MEDIUM"),
        points: 20,
      },
      {
        id: "graphic_low_quality",
        label: "Low-quality visuals",
        condition: finding("graphic.logo_quality", "MEDIUM"),
        points: 12,
      },
      {
        id: "graphic_no_system",
        label: "No brand system",
        condition: signal("no_brand_system"),
        points: 10,
      },
      {
        id: "graphic_new_business",
        label: "New business",
        condition: signal("new_business"),
        points: 15,
      },
      {
        id: "graphic_hiring",
        label: "Hiring a graphic designer",
        condition: signal("job_post_graphic_designer"),
        points: 15,
      },
      ...COMMON_RULES,
    ],
    qualifyThreshold: 61,
    borderlineBand: { min: 40, max: 60 },
    lowScoreAction: "DISQUALIFY",
  },
  pitchAngles: {
    NIGERIA: [
      angle(
        "ng_graphic_one_brand",
        "Same logo, same colours everywhere — customers recognise you faster.",
        ["inconsistent_branding"],
        ["brand-identity"],
        ["mocking their current logo"],
      ),
      angle(
        "ng_graphic_launch_kit",
        "Launching? Start with a brand kit you can use from day one.",
        ["new_business"],
        ["brand-identity", "social-pack"],
      ),
      angle(
        "ng_graphic_social",
        "Social posts that look as good as your product.",
        ["low_quality_visuals"],
        ["social-pack"],
      ),
    ],
    INTERNATIONAL: [
      angle(
        "intl_graphic_refresh",
        "Your logo on {surfaceA} and {surfaceB} doesn't match — a light refresh fixes that.",
        ["inconsistent_branding"],
        ["brand-identity", "case-study"],
        ["your branding is a mess"],
      ),
      angle(
        "intl_graphic_system",
        "A simple brand system so every post and flyer looks like you.",
        ["no_brand_system"],
        ["brand-system"],
      ),
      angle(
        "intl_graphic_overlap",
        "Design on retainer with same-day turnaround, from a team in your working hours.",
        ["job_post_graphic_designer"],
        ["retainer", "process"],
        ["cheap offshore"],
      ),
    ],
  },
  portfolio: placeholderPortfolio("graphic", [
    "brand-identity",
    "social-pack",
    "brand-system",
    "case-study",
    "retainer",
    "process",
  ]),
  pricing: {
    needsReview: true,
    packages: [
      {
        id: "graphic_logo_kit",
        name: "Logo and mini brand kit",
        includes: ["Logo", "Palette", "Type pairing", "Usage sheet"],
        timelineWeeks: { min: 1, max: 2 },
        prices: prices([150_000, 400_000], [400, 1_200], [350, 1_000]),
      },
      {
        id: "graphic_brand_identity",
        name: "Brand identity",
        includes: ["Full identity", "Guidelines", "Templates"],
        timelineWeeks: { min: 3, max: 6 },
        prices: prices([500_000, 1_500_000], [1_500, 4_000], [1_200, 3_200]),
      },
      {
        id: "graphic_social_pack",
        name: "Social design pack (monthly)",
        includes: ["12–20 designed posts per month"],
        timelineWeeks: { min: 4, max: 4 },
        prices: prices([100_000, 300_000], [300, 900], [250, 750]),
      },
      {
        id: "graphic_retainer",
        name: "Design retainer (monthly)",
        includes: ["Agreed hours of design per month"],
        timelineWeeks: { min: 4, max: 4 },
        prices: prices([250_000, 600_000], [800, 2_000], [650, 1_600]),
      },
    ],
  },
  sequences: sequences("graphic"),
  disqualifiers: [
    ...COMMON_DISQUALIFIERS,
    {
      id: "franchise_central_branding",
      label: "Franchise with central branding",
      description: "Branding set centrally by a franchisor.",
      aiReviewHint: "A franchise location whose branding the franchisor controls.",
    },
  ],
  approvalMode: "ALWAYS_REVIEW",
  capacityPolicy: CAPACITY_POLICY,
};

// ---------------------------------------------------------------------------------------------
// 3.3.4 Video Editing
// ---------------------------------------------------------------------------------------------
const VIDEO: Profile = {
  schemaVersion: 1,
  id: "VIDEO_EDITING",
  label: "Video Editing",
  description:
    "Editing, captions and thumbnails that help creators, coaches and brands post consistently.",
  owners: { roles: ["SERVICE_LEAD"], userIds: [] },
  contactRolePriority: ["creator", "channel manager", "founder", "marketing manager"],
  signals: [
    {
      id: "active_creator",
      label: "Active creator",
      description: "Posts regularly with a mid-sized audience.",
      weight: 5,
      markets: BOTH,
      evidenceRequired: "Uploads in the last 30 days, subscriber band 1k–500k",
      detectingSources: ["youtube-channels"],
      confirmedBy: ["video.cadence"],
      future: false,
    },
    {
      id: "active_creator_rough_editing",
      label: "Active creator, rough editing",
      description: "An active creator whose thumbnails or titles need work.",
      weight: 20,
      markets: BOTH,
      evidenceRequired: "Active creator and a thumbnails or titles finding with severity ≥ MEDIUM",
      detectingSources: [],
      confirmedBy: ["video.thumbnails", "video.titles_hooks"],
      derivedFrom: "audit",
      future: false,
    },
    derived(
      "no_captions",
      "No captions",
      12,
      "Fewer than 30% of the last 20 videos have captions",
      "video.captions",
    ),
    derived(
      "inconsistent_thumbnails",
      "Inconsistent thumbnails",
      12,
      "Thumbnails differ in style, legibility or branding",
      "video.thumbnails",
    ),
    {
      id: "gone_quiet",
      label: "Gone quiet",
      description: "The posting gap is growing.",
      weight: 15,
      markets: BOTH,
      evidenceRequired: "The posting gap is growing and the latest upload is more than 45 days old",
      detectingSources: ["youtube-channels"],
      confirmedBy: ["video.cadence"],
      future: false,
    },
    derived(
      "long_unedited_uploads",
      "Long unedited uploads",
      10,
      "Average long-form duration > 25 minutes with engagement below the channel median, or re-uploaded livestreams",
      "video.duration_profile",
    ),
    jobSignal(
      "job_post_video_editor",
      "Hiring a video editor",
      "Job post in the last 60 days matching video editor, youtube editor, content editor or reels editor",
    ),
  ],
  sources: [
    {
      adapterId: "youtube-channels",
      markets: BOTH,
      enabled: true,
      optional: false,
      defaultParams: {
        NIGERIA: {
          regionCode: "NG",
          keywords: [
            "Nigerian food recipes",
            "Lagos vlog",
            "tech reviews Nigeria",
            "fitness coach Nigeria",
            "real estate Lagos",
            "business podcast Nigeria",
          ],
          includeChurchMedia: false,
          subscriberBand: { min: 1_000, max: 200_000 },
        },
        INTERNATIONAL: {
          regionCodes: ["GB", "US", "CA", "IE"],
          keywords: [
            "coaches",
            "fitness",
            "cooking",
            "personal finance",
            "B2B podcasts",
            "real estate",
          ],
          subscriberBand: { min: 5_000, max: 500_000 },
        },
      },
    },
    ...jobSources(
      ["video editor", "YouTube editor"],
      ["Nigeria", "Lagos", "Abuja"],
      ["United Kingdom", "Ireland", "United States", "Canada"],
    ),
    ...csvAndManual,
  ],
  audits: [
    {
      agentId: "audit.video",
      checks: [
        { checkId: "video.cadence", required: true },
        { checkId: "video.captions", required: true },
        { checkId: "video.thumbnails", required: true },
        { checkId: "video.duration_profile", required: false },
        { checkId: "video.engagement", required: false },
        { checkId: "video.titles_hooks", required: false },
      ],
    },
  ],
  scoring: {
    rules: [
      {
        id: "video_rough",
        label: "Active creator, rough editing",
        condition: signal("active_creator_rough_editing"),
        points: 20,
      },
      {
        id: "video_active",
        label: "Active creator",
        condition: signal("active_creator"),
        points: 5,
      },
      {
        id: "video_captions",
        label: "Most videos have no captions",
        condition: finding("video.captions", "MEDIUM"),
        points: 12,
      },
      {
        id: "video_thumbnails",
        label: "Inconsistent thumbnails",
        condition: finding("video.thumbnails", "MEDIUM"),
        points: 12,
      },
      {
        id: "video_quiet",
        label: "Channel has gone quiet",
        condition: signal("gone_quiet"),
        points: 15,
      },
      {
        id: "video_long",
        label: "Long unedited uploads",
        condition: signal("long_unedited_uploads"),
        points: 8,
      },
      {
        id: "video_hiring",
        label: "Hiring a video editor",
        condition: signal("job_post_video_editor"),
        points: 15,
      },
      ...COMMON_RULES,
    ],
    qualifyThreshold: 61,
    borderlineBand: { min: 40, max: 60 },
    lowScoreAction: "DISQUALIFY",
  },
  pitchAngles: {
    NIGERIA: [
      angle(
        "ng_video_consistency",
        "Post every week without editing at midnight — we handle the edit.",
        ["active_creator", "gone_quiet"],
        ["youtube", "retainer"],
        ["commenting on their content quality"],
      ),
      angle(
        "ng_video_captions",
        "Most people watch on mute — captions keep them watching.",
        ["no_captions"],
        ["captions", "shorts"],
      ),
      angle(
        "ng_video_thumbnails",
        "Thumbnails that look like one brand help people recognise your videos.",
        ["inconsistent_thumbnails"],
        ["thumbnails"],
      ),
    ],
    INTERNATIONAL: [
      angle(
        "intl_video_captions",
        "{share}% of your last 20 videos have captions — adding them is an easy reach win.",
        ["no_captions"],
        ["captions", "case-study"],
        ["invented view uplifts"],
      ),
      angle(
        "intl_video_thumbnails",
        "A consistent thumbnail system makes your videos easier to spot.",
        ["inconsistent_thumbnails"],
        ["thumbnails"],
        ["your thumbnails are bad"],
      ),
      angle(
        "intl_video_comeback",
        "Your last upload was {days} days ago — we can get you back on a schedule.",
        ["gone_quiet"],
        ["retainer"],
        ["guilt-tripping"],
      ),
      angle(
        "intl_video_overlap",
        "An editing team in your working hours with 24–48h turnaround.",
        ["job_post_video_editor"],
        ["process", "retainer"],
        ["cheap offshore"],
      ),
    ],
  },
  portfolio: placeholderPortfolio("video", [
    "youtube",
    "retainer",
    "captions",
    "shorts",
    "thumbnails",
    "case-study",
    "process",
  ]),
  pricing: {
    needsReview: true,
    packages: [
      {
        id: "video_shorts_pack",
        name: "Shorts and Reels pack (monthly)",
        includes: ["8 short-form edits with captions"],
        timelineWeeks: { min: 4, max: 4 },
        prices: prices([120_000, 300_000], [300, 800], [250, 650]),
      },
      {
        id: "video_long_form",
        name: "Long-form edit (per video)",
        includes: ["Edit", "Captions", "Colour", "Sound clean-up"],
        timelineWeeks: { min: 1, max: 1 },
        prices: prices([40_000, 120_000], [120, 400], [100, 320]),
      },
      {
        id: "video_channel_retainer",
        name: "Channel retainer (monthly)",
        includes: ["4 long-form videos", "8 shorts", "Thumbnails"],
        timelineWeeks: { min: 4, max: 4 },
        prices: prices([350_000, 900_000], [1_000, 2_800], [800, 2_200]),
      },
      {
        id: "video_thumbnail_pack",
        name: "Thumbnail system",
        includes: ["Template set", "10 thumbnails"],
        timelineWeeks: { min: 1, max: 2 },
        prices: prices([60_000, 150_000], [150, 400], [120, 320]),
      },
    ],
  },
  sequences: sequences("video"),
  disqualifiers: [
    ...COMMON_DISQUALIFIERS,
    {
      id: "large_media_company",
      label: "Large media company",
      description: "A broadcaster or studio with an in-house post-production team.",
      aiReviewHint: "A broadcaster or studio with its own post-production team.",
    },
    {
      id: "made_for_kids_channel",
      label: "Made for kids channel",
      description: "Channels marked made for kids.",
      aiReviewHint: "The channel is marked made for kids.",
    },
  ],
  approvalMode: "ALWAYS_REVIEW",
  capacityPolicy: CAPACITY_POLICY,
};

// ---- Helpers used above (hoisted function declarations) ----

/** A signal first found by an audit (detectingSources [], derivedFrom "audit"). */
function derived(
  id: string,
  label: string,
  weight: number,
  evidenceRequired: string,
  confirmedBy: Profile["audits"][number]["checks"][number]["checkId"],
): Profile["signals"][number] {
  return {
    id,
    label,
    description: evidenceRequired,
    weight,
    markets: BOTH,
    evidenceRequired,
    detectingSources: [],
    confirmedBy: [confirmedBy],
    derivedFrom: "audit",
    future: false,
  };
}

/** A job-post signal, detected by the job adapters in both markets. */
function jobSignal(
  id: string,
  label: string,
  evidenceRequired: string,
): Profile["signals"][number] {
  return {
    id,
    label,
    description: "A recent job post for this line's role.",
    weight: 15,
    markets: BOTH,
    evidenceRequired,
    detectingSources: [...JOB_SOURCES],
    confirmedBy: [],
    future: false,
  };
}

export const INITIAL_PROFILES: Readonly<Record<ServiceLine, ServiceLineProfile>> = {
  WEB_DEVELOPMENT: WEB,
  UI_UX_DESIGN: UIUX,
  GRAPHIC_DESIGN: GRAPHIC,
  VIDEO_EDITING: VIDEO,
};

/** The note that marks a seeded placeholder version (Phase 7's seeder may supersede it). */
export const PLACEHOLDER_NOTE = "seed:placeholder";
