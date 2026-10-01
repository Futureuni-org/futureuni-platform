import "server-only";

/**
 * Mock SerpAPI Google Jobs adapter (ADR-005). Yields already-classified, relevant `job_post_<role>`
 * signals directly (it does NOT call the AI classifier), so the runner's integration tests need no
 * AI mocking. Recruitment-agency and in-house-team traps are exercised by the AI eval suite, not
 * here. Both markets; charges `ctx.budget`; honours `ctx.limit` and the `force-adapter-error`
 * keyword.
 */

import type { Market, ServiceLine } from "@/contracts/common";
import type { RawSignal, SourceContext } from "@/contracts/source-adapter";

import { defineAdapter } from "../types";
import { adapter as real } from "./index";

const JOB_SIGNAL: Readonly<Record<ServiceLine, string>> = {
  WEB_DEVELOPMENT: "job_post_web_developer",
  UI_UX_DESIGN: "job_post_product_designer",
  GRAPHIC_DESIGN: "job_post_graphic_designer",
  VIDEO_EDITING: "job_post_video_editor",
};

interface MockPosting {
  company: string;
  website?: string;
  location: string;
  country: string;
  externalId: string;
  url: string;
}

const POSTINGS: Readonly<Record<Market, MockPosting[]>> = {
  NIGERIA: [
    {
      company: "Lagos Fintech Co",
      website: "https://lagosfintech.ng",
      location: "Lagos, Nigeria",
      country: "NG",
      externalId: "serp-ng-0001",
      url: "https://serpapi.com/jobs/serp-ng-0001",
    },
    {
      company: "Abuja Retail Group",
      location: "Abuja, Nigeria",
      country: "NG",
      externalId: "serp-ng-0002",
      url: "https://serpapi.com/jobs/serp-ng-0002",
    },
  ],
  INTERNATIONAL: [
    {
      company: "Northwind Agency",
      website: "https://northwind.co.uk",
      location: "Manchester, United Kingdom",
      country: "GB",
      externalId: "serp-intl-0001",
      url: "https://serpapi.com/jobs/serp-intl-0001",
    },
    {
      company: "Harbor SaaS Inc",
      website: "https://harborsaas.com",
      location: "Austin, TX, United States",
      country: "US",
      externalId: "serp-intl-0002",
      url: "https://serpapi.com/jobs/serp-intl-0002",
    },
  ],
};

async function* search(_params: unknown, ctx: SourceContext): AsyncIterable<RawSignal> {
  await Promise.resolve(); // satisfies require-await; the mock yields fixtures synchronously
  if (ctx.keywords.includes("force-adapter-error")) {
    throw new Error("mock jobs-serpapi forced failure");
  }
  const signalType = JOB_SIGNAL[ctx.serviceLine];
  let emitted = 0;
  for (const posting of POSTINGS[ctx.market]) {
    if (emitted >= ctx.limit || ctx.signal.aborted) return;
    if (!ctx.budget.tryCharge(1, real.costPerCallMicros)) return;
    yield {
      adapterId: "jobs-serpapi",
      companyName: posting.company,
      ...(posting.website === undefined ? {} : { website: posting.website }),
      country: posting.country,
      signalType,
      evidenceText: `Job post for a ${ctx.serviceLine.toLowerCase().replace(/_/g, " ")} role at ${posting.company} (${posting.location}).`,
      evidence: { location: posting.location },
      sourceUrl: posting.url,
      observedAt: ctx.clock.now().toISOString(),
      externalRef: { adapterId: "jobs-serpapi", externalId: posting.externalId },
    };
    emitted += 1;
  }
}

export const mockAdapter: typeof real = { ...real, search, estimateCalls: () => 1 };

export default defineAdapter(mockAdapter);
