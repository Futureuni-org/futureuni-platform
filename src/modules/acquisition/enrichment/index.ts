/**
 * @/modules/acquisition/enrichment: crawler, extractors, finder, verifier, pipeline and jobs
 * (Phase 9). Provides `SEAM-SAFE-FETCH` through `@/platform/http`.
 */

import "server-only";

export { enrichLead, type EnrichLeadInput, type EnrichLeadResult } from "./pipeline";
export { crawlCompany, planCrawl, type CrawlOptions } from "./crawler";
export * from "./extract";
export { getEmailFinder, hunterFinder, mockFinder } from "./providers/finder";
export { getEmailVerifier, hunterVerifier, mockVerifier } from "./providers/verifier";
export { enrichmentJobs, enrichLeadJob, enrichBatchJob, enrichRefreshJob } from "./jobs";
export { enrichmentSettings } from "./settings";
export { enrichmentTasks, extractPeopleTask, pickContactTask } from "./tasks";
export { getActiveProfile, listActiveProfiles } from "./_seams";
