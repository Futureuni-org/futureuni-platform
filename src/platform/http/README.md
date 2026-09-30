# @/platform/http

The safe fetcher every crawl, extractor and integration call goes through (Phase 9).

## Public API

```ts
import { safeFetch, isAllowedByRobots } from "@/platform/http";

const result = await safeFetch("https://example.com/", {
  timeoutMs: 10_000,
  maxBytes: 2_000_000,
  respectRobots: true,
  followRedirects: 5,
});
if (!result.ok) console.warn(result.blockedReason); // "robots" | "ssrf" | "too-large" | "timeout" | "non-html" | "error"
```

## Guarantees

- **SSRF-safe.** DNS resolved, private and metadata addresses refused (v4 + v6), rechecked after
  every redirect. `http:`/`https:` only. Ports outside `{80, 443, 8080, 8443}` refused.
- **Robots.** `robots.txt` fetched via the safe pipeline itself, cached per origin for 24 h, and
  honoured for `FUTUREUNI-Bot/1.0`. Off only for official APIs (`respectRobots: false`).
- **Limits.** `timeoutMs` + `maxBytes` enforced while streaming; a redirect cap.
- **Politeness.** Per-origin serial with a min delay (default 1 s) and a global concurrency cap.
- **Observability.** Counters (`readCounters()`) for fetches, blocks by reason and bytes. Bodies
  are never logged.

## SEAM-SAFE-FETCH

Phases 8 and 10 stub this seam while running in parallel; at merge, the stand-ins are replaced
with imports from `@/platform/http` (`docs/prompts/wave-2/wave-2-prep-and-merge.md` Part B2). The
signatures are the ones in `docs/contracts/enrichment.md`.
