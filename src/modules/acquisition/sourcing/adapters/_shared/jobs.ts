import "server-only";

/**
 * Shared job-post pipeline for the job adapters (jobs-serpapi, jobs-adzuna, myjobmag, jobberman).
 * Each adapter fetches its provider's postings and hands them here; this turns them into
 * `job_post_<role>` signals, using the AI classifier to weed out recruitment agencies and full
 * in-house teams, and the extractor to clean up messy employer names (Phase 8 Step 4).
 *
 * The classifier and extractor run as AI tasks (their own budget/quota), never inside a database
 * transaction. A posting the classifier rejects, or a classifier error, drops that one posting and
 * never fails the adapter.
 */

import type { ServiceLine } from "@/contracts/common";
import type { RawSignal, SourceContext } from "@/contracts/source-adapter";
import { runTask } from "@/platform/ai";

import {
  ClassifyJobPostOutputSchema,
  ExtractCompanyOutputSchema,
  type ClassifyJobPostInput,
  type ClassifyJobPostOutput,
  type ExtractCompanyInput,
  type ExtractCompanyOutput,
} from "../../tasks";

/** The signal each line records for a matching job post (source-adapter.md §3a). */
const JOB_SIGNAL_BY_LINE: Readonly<Record<ServiceLine, string>> = {
  WEB_DEVELOPMENT: "job_post_web_developer",
  UI_UX_DESIGN: "job_post_product_designer",
  GRAPHIC_DESIGN: "job_post_graphic_designer",
  VIDEO_EDITING: "job_post_video_editor",
};

export interface RawJobPosting {
  externalId: string;
  title: string;
  companyName: string;
  companyWebsite?: string | null;
  location?: string | null;
  snippet?: string | null;
  /** ISO 8601 posting date, if the provider gives one. */
  postedAt?: string | null;
  /** The posting URL (becomes the signal's sourceUrl). */
  url: string;
  country?: string | null;
}

/** A messy employer name worth sending to the extractor: long, punctuated, or noisy. */
function looksMessy(name: string): boolean {
  return (
    name.length > 60 ||
    /[|•·\n]/.test(name) ||
    /\b(hiring|recruit|urgently|apply now|careers?)\b/i.test(name)
  );
}

async function classify(
  posting: RawJobPosting,
  ctx: SourceContext,
): Promise<ClassifyJobPostOutput | null> {
  const input: ClassifyJobPostInput = {
    title: posting.title,
    companyName: posting.companyName,
    ...(posting.snippet == null ? {} : { snippet: posting.snippet }),
    ...(posting.location == null ? {} : { location: posting.location }),
    serviceLine: ctx.serviceLine,
    market: ctx.market,
  };
  try {
    const result = await runTask<ClassifyJobPostInput, ClassifyJobPostOutput>({
      task: "acquisition.source-classify-job-post",
      input,
      actor: ctx.actor,
      context: { module: "acquisition" },
    });
    return ClassifyJobPostOutputSchema.parse(result.output);
  } catch {
    ctx.log.warn("classify-job-post failed; dropping posting", { externalId: posting.externalId });
    return null;
  }
}

async function extractCompany(
  posting: RawJobPosting,
  ctx: SourceContext,
): Promise<ExtractCompanyOutput | null> {
  const input: ExtractCompanyInput = {
    rawText: [posting.companyName, posting.title, posting.snippet ?? ""].join("\n").slice(0, 2_000),
    serviceLine: ctx.serviceLine,
    market: ctx.market,
  };
  try {
    const result = await runTask<ExtractCompanyInput, ExtractCompanyOutput>({
      task: "acquisition.source-extract-company",
      input,
      actor: ctx.actor,
      context: { module: "acquisition" },
    });
    return ExtractCompanyOutputSchema.parse(result.output);
  } catch {
    return null;
  }
}

/**
 * Turns the adapter's fetched postings into `RawSignal`s, one per relevant post. Stops when the
 * adapter's share of the run limit (`ctx.limit`) is reached.
 */
export async function* jobPostingsToSignals(
  adapterId: RawSignal["adapterId"],
  postings: readonly RawJobPosting[],
  ctx: SourceContext,
): AsyncIterable<RawSignal> {
  const signalType = JOB_SIGNAL_BY_LINE[ctx.serviceLine];
  let emitted = 0;
  for (const posting of postings) {
    if (emitted >= ctx.limit || ctx.signal.aborted) return;

    const verdict = await classify(posting, ctx);
    if (verdict === null) continue;
    if (verdict.relevantLine !== ctx.serviceLine) continue;
    if (verdict.isRecruitmentAgency || verdict.isInHouseFullTeam) continue;

    let companyName = posting.companyName;
    let website = posting.companyWebsite ?? undefined;
    let country = posting.country ?? undefined;
    if (looksMessy(companyName) || (website === undefined && posting.snippet != null)) {
      const extracted = await extractCompany(posting, ctx);
      if (extracted !== null) {
        companyName = extracted.companyName;
        website = extracted.website ?? website;
        country = extracted.country ?? country;
      }
    }

    const observedAt = posting.postedAt ?? ctx.clock.now().toISOString();
    const evidenceParts = [`Job post "${posting.title}"`, `at ${companyName}`];
    if (posting.location != null) evidenceParts.push(`(${posting.location})`);
    if (posting.postedAt != null) evidenceParts.push(`posted ${posting.postedAt.slice(0, 10)}`);

    yield {
      adapterId,
      companyName,
      ...(website === undefined ? {} : { website }),
      ...(country === undefined ? {} : { country }),
      signalType,
      evidenceText: `${evidenceParts.join(" ")}.`,
      evidence: {
        title: posting.title,
        location: posting.location ?? null,
        postedAt: posting.postedAt ?? null,
        classifierConfidence: verdict.confidence,
      },
      sourceUrl: posting.url,
      observedAt,
      externalRef: { adapterId, externalId: posting.externalId },
    };
    emitted += 1;
  }
}
