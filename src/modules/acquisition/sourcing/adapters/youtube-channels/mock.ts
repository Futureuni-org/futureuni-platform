import "server-only";

/**
 * Mock YouTube adapter (ADR-005): realistic creator fixtures for both markets, used when
 * `MOCKS=true` or no key is set. Mirrors the real adapter, still charges `ctx.budget`, and throws
 * on a `force-adapter-error` keyword (the runner's resilience test).
 */

import type { Market } from "@/contracts/common";
import type { RawSignal, SourceContext } from "@/contracts/source-adapter";

import { defineAdapter } from "../types";
import { adapter as real } from "./index";

type Fixture = Omit<RawSignal, "adapterId" | "observedAt">;

const FIXTURES: Readonly<Record<Market, Fixture[]>> = {
  NIGERIA: [
    {
      companyName: "Lagos Food Diary",
      country: "NG",
      signalType: "active_creator",
      evidenceText: "Active creator: 52,000 subscribers and an upload within the last 30 days.",
      evidence: { subscribers: 52_000, lastUploadAt: "2026-09-20T10:00:00Z" },
      sourceUrl: "https://www.youtube.com/channel/UCngfooddiary0000000000",
      externalRef: { adapterId: "youtube-channels", externalId: "UCngfooddiary0000000000" },
    },
    {
      companyName: "Naija Tech Review",
      country: "NG",
      signalType: "gone_quiet",
      evidenceText: "The channel's latest upload was 61 days ago, longer than 45 days.",
      evidence: { lastUploadAt: "2026-08-01T09:00:00Z", daysSinceUpload: 61, subscribers: 38_000 },
      sourceUrl: "https://www.youtube.com/channel/UCnaijatech000000000000",
      externalRef: { adapterId: "youtube-channels", externalId: "UCnaijatech000000000000" },
    },
  ],
  INTERNATIONAL: [
    {
      companyName: "Coach Mara Fitness",
      country: "GB",
      signalType: "active_creator",
      evidenceText: "Active creator: 120,000 subscribers and an upload within the last 30 days.",
      evidence: { subscribers: 120_000, lastUploadAt: "2026-09-22T12:00:00Z" },
      sourceUrl: "https://www.youtube.com/channel/UCcoachmara00000000000000",
      externalRef: { adapterId: "youtube-channels", externalId: "UCcoachmara00000000000000" },
    },
  ],
};

async function* search(_params: unknown, ctx: SourceContext): AsyncIterable<RawSignal> {
  await Promise.resolve(); // satisfies require-await; the mock yields fixtures synchronously
  if (ctx.keywords.includes("force-adapter-error")) {
    throw new Error("mock youtube-channels forced failure");
  }
  let emitted = 0;
  for (const fixture of FIXTURES[ctx.market]) {
    if (emitted >= ctx.limit || ctx.signal.aborted) return;
    if (!ctx.budget.tryCharge(1, real.costPerCallMicros)) return;
    yield { ...fixture, adapterId: "youtube-channels", observedAt: ctx.clock.now().toISOString() };
    emitted += 1;
  }
}

export const mockAdapter: typeof real = { ...real, search, estimateCalls: () => 1 };

export default defineAdapter(mockAdapter);
