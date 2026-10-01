import "server-only";

/**
 * Mock Adzuna adapter (ADR-005). Yields already-classified international `job_post_<role>` signals
 * directly (no AI call), for tests that exercise the mapping shape. The real adapter is DISABLED, so
 * this never runs in a normal run; it exists for unit tests and local development.
 */

import type { ServiceLine } from "@/contracts/common";
import type { RawSignal, SourceContext } from "@/contracts/source-adapter";

import { defineAdapter } from "../types";
import { adapter as real } from "./index";

const JOB_SIGNAL: Readonly<Record<ServiceLine, string>> = {
  WEB_DEVELOPMENT: "job_post_web_developer",
  UI_UX_DESIGN: "job_post_product_designer",
  GRAPHIC_DESIGN: "job_post_graphic_designer",
  VIDEO_EDITING: "job_post_video_editor",
};

async function* search(_params: unknown, ctx: SourceContext): AsyncIterable<RawSignal> {
  await Promise.resolve(); // satisfies require-await; the mock yields fixtures synchronously
  if (ctx.keywords.includes("force-adapter-error")) {
    throw new Error("mock jobs-adzuna forced failure");
  }
  if (ctx.market !== "INTERNATIONAL") return;
  if (!ctx.budget.tryCharge(1, real.costPerCallMicros)) return;
  if (ctx.limit < 1) return;
  yield {
    adapterId: "jobs-adzuna",
    companyName: "Bristol Bakes Ltd",
    website: "https://bristolbakes.co.uk",
    country: "GB",
    signalType: JOB_SIGNAL[ctx.serviceLine],
    evidenceText: `Job post for a ${ctx.serviceLine.toLowerCase().replace(/_/g, " ")} role at Bristol Bakes Ltd (Bristol, UK).`,
    evidence: { location: "Bristol, UK" },
    sourceUrl: "https://www.adzuna.co.uk/jobs/details/adzuna-mock-0001",
    observedAt: ctx.clock.now().toISOString(),
    externalRef: { adapterId: "jobs-adzuna", externalId: "adzuna-mock-0001" },
  };
}

export const mockAdapter: typeof real = { ...real, search, estimateCalls: () => 1 };

export default defineAdapter(mockAdapter);
