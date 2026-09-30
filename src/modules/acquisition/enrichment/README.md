# @/modules/acquisition/enrichment

Turns a company name into a reachable, compliant lead: crawl the website, extract contacts and
signals, find and verify emails, pick the primary contact, and hand the lead to compliance for a
contactability verdict.

## Public API

```ts
import { enrichLead, enrichmentJobs, enrichmentSettings, enrichmentTasks } from "@/modules/acquisition/enrichment";

const result = await enrichLead({ leadId, actor: { type: "SYSTEM", job: "acquisition.enrichment.lead" } });
// { status: "ENRICHED" | "SUPPRESSED" | "DISQUALIFIED", pagesFetched, emailsFound, phonesFound, emailVerdict }
```

Jobs, settings and tasks are exported for the acquisition manifest (Phase 19 integration).

## SEAM-PROFILE

`enrichment/_seams.ts` reads the active `ServiceLineProfileVersion` row until Phase 7 is merged;
imports of `getActiveProfile` are re-pointed to `@/modules/acquisition/profiles` at integration.
