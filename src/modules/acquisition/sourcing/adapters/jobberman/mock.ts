import "server-only";

/**
 * Mock Jobberman adapter (ADR-005). The real adapter is DISABLED with no compliant data source, so
 * this mock exists only to give tests a small, realistic Nigerian job-post fixture set. It yields
 * already-classified `job_post_<role>` signals directly (no AI call).
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
    throw new Error("mock jobberman forced failure");
  }
  if (ctx.market !== "NIGERIA") return;
  if (!ctx.budget.tryCharge(1, real.costPerCallMicros)) return;
  if (ctx.limit < 1) return;
  yield {
    adapterId: "jobberman",
    companyName: "Zuri Stores NG",
    country: "NG",
    signalType: JOB_SIGNAL[ctx.serviceLine],
    evidenceText: `Job post for a ${ctx.serviceLine.toLowerCase().replace(/_/g, " ")} role at Zuri Stores NG (Lagos, Nigeria).`,
    evidence: { location: "Lagos, Nigeria" },
    sourceUrl: "https://www.jobberman.com/listings/jobberman-mock-0001",
    observedAt: ctx.clock.now().toISOString(),
    externalRef: { adapterId: "jobberman", externalId: "jobberman-mock-0001" },
  };
}

export const mockAdapter: typeof real = { ...real, search, estimateCalls: () => 1 };

export default defineAdapter(mockAdapter);
