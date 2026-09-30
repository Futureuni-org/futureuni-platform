/**
 * `crawlCompany` (Phase 9): fetches the homepage and a small set of prioritised internal pages,
 * runs every pure extractor, and returns an `EnrichmentResult` shape for the pipeline to merge
 * into `Company`/`Contact`. A crawl failure never propagates — the caller reads `crawlStatus`.
 */

import "server-only";

import { getDomain } from "tldts";

import type { EnrichmentContext, EnrichmentResult } from "@/contracts/enrichment";

import {
  extractAddress,
  extractEmails,
  extractLegalFormHints,
  extractPhones,
  extractSocials,
  extractTechHints,
} from "../extract";
import { planCrawl } from "./plan";

export interface CrawlOptions {
  maxPages?: number;
  stopWhenFound?: {
    email?: boolean;
    phone?: boolean;
    legalFormHint?: boolean;
  };
}

export async function crawlCompany(
  company: { id: string; name: string; website: string | null; normalizedDomain: string | null; country: string | null },
  ctx: EnrichmentContext,
  opts: CrawlOptions = {},
): Promise<EnrichmentResult> {
  const maxPages = opts.maxPages ?? 10;
  const stop = opts.stopWhenFound ?? { email: true, phone: true, legalFormHint: true };

  if (company.website === null || company.website === "") {
    return emptyResult("NO_WEBSITE");
  }

  let seedUrl: URL;
  try {
    seedUrl = new URL(company.website);
  } catch {
    return emptyResult("FAILED");
  }
  const origin = `${seedUrl.protocol}//${seedUrl.host}`;
  const seedDomain = company.normalizedDomain ?? getDomain(seedUrl.hostname) ?? seedUrl.hostname;

  const visited = new Set<string>();
  const emails = new Map<string, EnrichmentResult["emails"][number]>();
  const phones = new Map<string, EnrichmentResult["phones"][number]>();
  const legalFormHints: EnrichmentResult["legalFormHints"] = [];
  let socials: EnrichmentResult["socials"] = {};
  let address: EnrichmentResult["address"];
  let techHints: EnrichmentResult["techHints"];
  let pagesFetched = 0;
  let crawlStatus: EnrichmentResult["crawlStatus"] = "OK";
  const notes: string[] = [];

  const queue: string[] = [seedUrl.toString()];

  while (queue.length > 0 && pagesFetched < maxPages) {
    if (ctx.signal.aborted) break;
    const next = queue.shift();
    if (next === undefined) break;
    if (visited.has(next)) continue;
    visited.add(next);

    let result;
    try {
      result = await ctx.safeFetch(next, { timeoutMs: 10_000, maxBytes: 2_000_000, respectRobots: true });
    } catch (error) {
      notes.push(`fetch-error:${errorMessage(error)}`);
      crawlStatus = crawlStatus === "OK" ? "PARTIAL" : crawlStatus;
      continue;
    }
    pagesFetched += 1;
    if (!result.ok || result.body === null) {
      notes.push(`skip:${result.blockedReason ?? String(result.status)}`);
      crawlStatus = crawlStatus === "OK" ? "PARTIAL" : crawlStatus;
      continue;
    }

    // Extract from this page.
    for (const email of extractEmails({ html: result.body, pageUrl: result.finalUrl })) {
      emails.set(email.email, email);
    }
    for (const phone of extractPhones({ html: result.body, defaultCountry: company.country, pageUrl: result.finalUrl })) {
      phones.set(phone.e164, phone);
    }
    socials = { ...extractSocials(result.body), ...socials };
    const addr = extractAddress(result.body, company.country);
    address ??= addr ?? undefined;
    techHints ??= extractTechHints(result.body, { isHttps: seedUrl.protocol === "https:" });
    for (const hint of extractLegalFormHints({ html: result.body, pageUrl: result.finalUrl })) {
      legalFormHints.push(hint);
    }

    // Enqueue prioritised internal links from this page (breadth is bounded by maxPages).
    for (const url of planCrawl(result.body, { origin, seedDomain, maxPages: maxPages - visited.size })) {
      if (!visited.has(url) && !queue.includes(url)) queue.push(url);
    }

    if (
      (stop.email !== false && emails.size > 0) &&
      (stop.phone !== false && phones.size > 0) &&
      (stop.legalFormHint !== false && legalFormHints.length > 0)
    ) {
      break;
    }
  }

  if (pagesFetched === 0) crawlStatus = "FAILED";

  const result: EnrichmentResult = {
    enricherId: "website-crawler",
    pagesFetched,
    emails: [...emails.values()],
    phones: [...phones.values()],
    legalFormHints,
    contacts: [],
    notes,
    costMicros: 0,
    crawlStatus,
    ...(Object.keys(socials).length === 0 ? {} : { socials }),
    ...(address === undefined ? {} : { address }),
    ...(techHints === undefined ? {} : { techHints }),
  };
  return result;
}

function emptyResult(status: EnrichmentResult["crawlStatus"]): EnrichmentResult {
  return {
    enricherId: "website-crawler",
    ...(status === undefined ? {} : { crawlStatus: status }),
    pagesFetched: 0,
    emails: [],
    phones: [],
    legalFormHints: [],
    contacts: [],
    notes: [],
    costMicros: 0,
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 100) : "unknown";
}
