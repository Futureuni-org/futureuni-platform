import "server-only";

/**
 * MyJobMag adapter (Phase 8) — DISABLED for live runs until FUTUREUNI confirms feed use in writing
 * with MyJobMag (services@myjobmag.com). It reads ONLY the public XML job feeds (robots.txt allows
 * them; query-string pages are disallowed), never scraped pages (INV-14). The real feed parser
 * below is ready for when the feed use is confirmed. Re-verified 2026-10-01.
 */

import { XMLParser } from "fast-xml-parser";
import { z } from "zod";

import type { RawSignal, SourceContext } from "@/contracts/source-adapter";

import { defineAdapter, type InternalSourceAdapter } from "../types";
import { jobPostingsToSignals, type RawJobPosting } from "../_shared/jobs";

const FEED_URL = "https://www.myjobmag.com/jobsxml.xml";

const ParamsSchema = z.object({
  feedUrl: z.url().default(FEED_URL),
});
type Params = z.infer<typeof ParamsSchema>;

function asString(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim() !== "") return value.trim();
  if (typeof value === "number") return String(value);
  return undefined;
}

/** Find the array of job-like entries in a parsed feed (RSS <item>, Atom <entry>, or <jobs><job>). */
function entriesOf(parsed: unknown): Record<string, unknown>[] {
  if (typeof parsed !== "object" || parsed === null) return [];
  const root = parsed as Record<string, unknown>;
  const candidates: unknown[] = [
    (root.jobs as Record<string, unknown> | undefined)?.job,
    (root.rss as { channel?: { item?: unknown } } | undefined)?.channel?.item,
    (root.feed as { entry?: unknown } | undefined)?.entry,
    root.item,
    root.job,
  ];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate as Record<string, unknown>[];
    if (typeof candidate === "object" && candidate !== null) {
      return [candidate as Record<string, unknown>];
    }
  }
  return [];
}

function toPosting(entry: Record<string, unknown>): RawJobPosting | null {
  const title = asString(entry.title);
  const url = asString(entry.link) ?? asString(entry.url) ?? asString(entry.guid);
  const company =
    asString(entry.company) ?? asString(entry.employer) ?? asString(entry["company-name"]);
  if (title === undefined || url === undefined || company === undefined) return null;
  const externalId = asString(entry.guid) ?? url;
  const snippet = asString(entry.description) ?? asString(entry.summary);
  const postedAt = asString(entry.pubDate) ?? asString(entry.published);
  return {
    externalId,
    title,
    companyName: company,
    url,
    ...(snippet === undefined ? {} : { snippet }),
    ...(postedAt === undefined ? {} : { postedAt }),
    country: "NG",
  };
}

async function* search(params: Params, ctx: SourceContext): AsyncIterable<RawSignal> {
  if (!ctx.budget.tryCharge(1, adapter.costPerCallMicros)) return;
  const result = await ctx.safeFetch(params.feedUrl, { respectRobots: true });
  if (!result.ok || result.body === null) {
    ctx.log.warn("myjobmag feed fetch failed", {
      status: result.status,
      blockedReason: result.blockedReason ?? null,
    });
    return;
  }
  const parser = new XMLParser({ ignoreAttributes: false, trimValues: true });
  let parsed: unknown;
  try {
    parsed = parser.parse(result.body);
  } catch {
    ctx.log.warn("myjobmag feed could not be parsed");
    return;
  }
  const postings: RawJobPosting[] = [];
  for (const entry of entriesOf(parsed)) {
    const posting = toPosting(entry);
    if (posting !== null) postings.push(posting);
  }
  yield* jobPostingsToSignals("myjobmag", postings, ctx);
}

export const adapter: InternalSourceAdapter<Params> = {
  id: "myjobmag",
  label: "MyJobMag (feeds)",
  description: "Nigerian job posts from MyJobMag's public XML feeds (feed use pending confirmation).",
  markets: ["NIGERIA"],
  supportedServiceLines: ["WEB_DEVELOPMENT", "UI_UX_DESIGN", "GRAPHIC_DESIGN", "VIDEO_EDITING"],
  paramsSchema: ParamsSchema,
  search,
  estimateCalls: () => 1, // one feed fetch per run
  rateLimit: { perSecond: 0.5, perDay: null },
  costPerCallMicros: 0,
  termsNotes:
    "Reads only the public XML feeds (jobsxml.xml / aggregate_feed.xml), which robots.txt allows; query-string pages are disallowed. Feed TTL ~10 minutes. 2012 terms have no anti-scraping clause. Confirm feed use in writing before enabling.",
  docsUrl: "https://www.myjobmag.com/feeds/",
  termsUrl: "https://www.myjobmag.com/terms",
  requiresCredential: null,
  status: "DISABLED",
  disabledReason:
    "MyJobMag reads only its public XML feeds; live use pending written confirmation of feed use with MyJobMag (docs/integrations.md).",
};

export default defineAdapter(adapter);
