import "server-only";

/**
 * Mock MyJobMag adapter (ADR-005). Yields already-classified Nigerian `job_post_<role>` signals
 * directly (no AI call), for tests and local development. The real adapter is DISABLED for live
 * runs until feed use is confirmed.
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

const COMPANIES = ["Naija Eats Ltd", "Lagos Style Co"];

async function* search(_params: unknown, ctx: SourceContext): AsyncIterable<RawSignal> {
  await Promise.resolve(); // satisfies require-await; the mock yields fixtures synchronously
  if (ctx.keywords.includes("force-adapter-error")) {
    throw new Error("mock myjobmag forced failure");
  }
  if (ctx.market !== "NIGERIA") return;
  let emitted = 0;
  for (const [i, company] of COMPANIES.entries()) {
    if (emitted >= ctx.limit || ctx.signal.aborted) return;
    if (!ctx.budget.tryCharge(1, real.costPerCallMicros)) return;
    yield {
      adapterId: "myjobmag",
      companyName: company,
      country: "NG",
      signalType: JOB_SIGNAL[ctx.serviceLine],
      evidenceText: `Job post for a ${ctx.serviceLine.toLowerCase().replace(/_/g, " ")} role at ${company} (Nigeria).`,
      evidence: { location: "Nigeria" },
      sourceUrl: `https://www.myjobmag.com/job/myjobmag-mock-000${String(i + 1)}`,
      observedAt: ctx.clock.now().toISOString(),
      externalRef: { adapterId: "myjobmag", externalId: `myjobmag-mock-000${String(i + 1)}` },
    };
    emitted += 1;
  }
}

export const mockAdapter: typeof real = { ...real, search, estimateCalls: () => 1 };

export default defineAdapter(mockAdapter);
