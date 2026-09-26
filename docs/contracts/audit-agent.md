# Contract: Audit agents, findings and the browser runtime

| | |
|---|---|
| Module | `src/contracts/audit-agent.ts` |
| Types written by | Phase 2 |
| Implemented by | Phase 10 (`src/modules/acquisition/audits/` agents and orchestration; `src/platform/browser/` capture runtime, ADR-017) |
| Consumers | 7 (profile `audits[]`), 11 (scoring on findings), 12 (outreach cites findings, INV-5), 14 (pre-call briefs, proposals), 16 (evidence tab), 17 (conversion by signal and finding) |
| Related rules | INV-5, INV-14, INV-18, INV-24 |

## 1. Purpose

FUTUREUNI's free mini-audit. For each lead, the audit agents for its service line inspect the prospect's public presence and produce **findings**. Each finding is a precise claim with the evidence behind it, plus a source URL or a captured artifact. Outreach may only say what findings prove, so accuracy beats volume.

## 2. Types and schemas

```ts
// src/contracts/audit-agent.ts
import { z } from "zod";
import {
  Iso8601Schema, HttpUrlSchema, ServiceLineSchema, MarketSchema, FindingSeveritySchema, FindingMethodSchema,
  CostMicrosSchema, CheckRunStatusSchema, AuditStatusSchema, type Clock,
} from "./common";
import type { SafeFetch } from "./enrichment";
import type { RunTask } from "./ai-service";
import type { ServiceLineProfile } from "./service-line-profile";

export const AuditAgentIdSchema = z.enum(["audit.web", "audit.uiux", "audit.graphic", "audit.video"]);
export type AuditAgentId = z.infer<typeof AuditAgentIdSchema>;

export const AuditCheckIdSchema = z.enum([
  // audit.web (WEB_DEVELOPMENT)
  "web.no_website", "web.pagespeed_mobile", "web.pagespeed_desktop", "web.ssl", "web.mobile_viewport",
  "web.broken_links", "web.seo_basics", "web.outdated", "web.contact_path", "web.visual_first_impression",
  // audit.uiux (UI_UX_DESIGN)
  "uiux.app_reviews", "uiux.onboarding_capture", "uiux.heuristics", "uiux.accessibility", "uiux.mobile_layout",
  // audit.graphic (GRAPHIC_DESIGN)
  "graphic.brand_surfaces", "graphic.consistency", "graphic.logo_quality", "graphic.social_presence_fit",
  // audit.video (VIDEO_EDITING)
  "video.cadence", "video.captions", "video.duration_profile", "video.engagement", "video.thumbnails", "video.titles_hooks",
]);
export type AuditCheckId = z.infer<typeof AuditCheckIdSchema>;

export const AuditCheckDefinitionSchema = z.object({
  id: AuditCheckIdSchema,
  label: z.string().max(80),
  method: FindingMethodSchema,                       // MEASURED | OBSERVED | AI_JUDGED
  defaultRequired: z.boolean(),
  aiTask: z.string().optional(),                     // e.g. "acquisition.audit-uiux-heuristics"
  estimatedCostMicros: CostMicrosSchema,
  cacheScope: z.enum(["domain", "company", "none"]).default("domain"),   // reuse across leads within the TTL (default 7 days)
});

// ---------- Findings ----------
/** Structured evidence. Use the fields that fit; measured values go in metrics, quotes carry their source ids. */
export const FindingEvidenceSchema = z.object({
  metrics: z.record(z.string(), z.union([z.number(), z.string(), z.boolean()])).optional(),   // { lcpSeconds: 7.2, performanceScore: 34 }
  thresholds: z.record(z.string(), z.number()).optional(),                                    // { lcpSeconds: 4 }
  counts: z.record(z.string(), z.int().nonnegative()).optional(),                             // { brokenLinks: 3, checked: 20 }
  quotes: z.array(z.object({ refId: z.string(), text: z.string().max(500), sourceUrl: HttpUrlSchema.optional() })).optional(),
  artifacts: z.array(z.object({ key: z.string(), label: z.string().max(80), viewport: z.enum(["mobile", "desktop"]).optional() })).optional(),
  observations: z.array(z.string().max(300)).optional(),        // factual, e.g. "No <meta name=viewport> tag"
  referenceIds: z.array(z.string()).optional(),                 // for AI_JUDGED: artifact keys, review ids, thumbnail URLs from the input only
  sampleSize: z.int().nonnegative().optional(),
  notAssessedReason: z.string().max(200).optional(),
});
export type FindingEvidence = z.infer<typeof FindingEvidenceSchema>;

export const AuditFindingInputSchema = z.object({
  checkId: AuditCheckIdSchema,
  severity: FindingSeveritySchema,                   // CRITICAL | HIGH | MEDIUM | LOW | INFO
  claim: z.string().min(10).max(240),                // one precise sentence; for MEASURED checks, generated from a template
  evidence: FindingEvidenceSchema,
  sourceUrl: HttpUrlSchema.optional(),
  artifactKey: z.string().optional(),                // FileObject key (purpose AUDIT_SCREENSHOT)
  capturedAt: Iso8601Schema,
  method: FindingMethodSchema,
  confidence: z.number().min(0).max(1),
  pitchable: z.boolean(),
}).refine((f) => f.sourceUrl !== undefined || f.artifactKey !== undefined, { error: "A finding needs a sourceUrl or an artifactKey (INV-18)", path: ["sourceUrl"] })
  .refine((f) => !(f.method === "AI_JUDGED" && f.pitchable && f.confidence < 0.7), { error: "AI-judged findings below 0.7 confidence can't be pitchable", path: ["pitchable"] })
  .refine((f) => !(f.method === "AI_JUDGED" && (f.evidence.referenceIds ?? []).length === 0), { error: "AI-judged findings must cite input references", path: ["evidence", "referenceIds"] });
export type AuditFindingInput = z.infer<typeof AuditFindingInputSchema>;

export const CheckRunResultSchema = z.object({
  checkId: AuditCheckIdSchema,
  status: CheckRunStatusSchema,
  reason: z.string().max(300).optional(),            // e.g. "not assessed: no compliant data source (Instagram)"
  durationMs: z.int().nonnegative(),
  costMicros: CostMicrosSchema,
});

export const AuditResultSchema = z.object({
  agentId: AuditAgentIdSchema,
  status: AuditStatusSchema.extract(["SUCCEEDED", "PARTIAL", "FAILED", "NOT_APPLICABLE"]),
  checks: z.array(CheckRunResultSchema),
  findings: z.array(AuditFindingInputSchema),
  costMicros: CostMicrosSchema,
});
export type AuditResult = z.infer<typeof AuditResultSchema>;

// ---------- Agent interface ----------
export type AuditCompanyInput = {
  id: string; name: string; website: string | null; normalizedDomain: string | null; websiteKind: string;
  country: string | null; city: string | null; socials: Record<string, string | undefined>;
  techHints: Record<string, unknown> | null; externalRefs: Array<{ adapterId: string; externalId: string; url?: string }>;
};
export interface AuditContext {
  lead: { id: string; serviceLine: z.infer<typeof ServiceLineSchema>; market: z.infer<typeof MarketSchema>; country: string | null };
  profile: ServiceLineProfile;                        // SEAM-PROFILE until Phase 7 is merged
  requiredChecks: ReadonlySet<AuditCheckId>;          // from profile.audits[]
  safeFetch: SafeFetch;                               // SEAM-SAFE-FETCH until Phase 9 is merged
  capture: Capture;                                   // @/platform/browser
  runTask: RunTask;                                   // @/platform/ai
  storage: { putFile(input: { key: string; body: Uint8Array; contentType: string; access: "private"; purpose: "AUDIT_SCREENSHOT" }): Promise<{ key: string }> };
  costMeter: { tryCharge(micros: number, label: string): boolean; spentMicros(): number };   // per-lead cap from settings
  cache: { get(key: string): Promise<unknown>; set(key: string, value: unknown, ttlSeconds: number): Promise<void> }; // a miss is null
  clock: Clock;
  signal: AbortSignal;
  force: boolean;                                     // bypass the domain cache
  log: { info(msg: string, data?: Record<string, unknown>): void; warn(msg: string, data?: Record<string, unknown>): void };
}
export interface AuditAgent {
  id: AuditAgentId;
  serviceLine: z.infer<typeof ServiceLineSchema>;
  checks: Array<z.infer<typeof AuditCheckDefinitionSchema>>;
  run(company: AuditCompanyInput, ctx: AuditContext): Promise<AuditResult>;
}

// ---------- Browser runtime (Phase 10, exact types) ----------
export type CaptureRequest = {
  url: string;
  viewport: "mobile" | "desktop";           // mobile = 390x844 @2x, desktop = 1440x900
  fullPage?: boolean;                       // default false (above the fold + one scroll)
  waitFor?: "load" | "networkidle";         // default "load", hard timeout 20s
  actions?: Array<{ type: "click-text"; text: string } | { type: "scroll"; px: number }>; // navigation only
  collect?: { html?: boolean; axe?: boolean; consoleErrors?: boolean; ogImages?: boolean };
};
export type CaptureResult = {
  ok: boolean; finalUrl: string; screenshotKey?: string; html?: string;
  axeViolations?: Array<{ id: string; impact: string; nodes: number; help: string }>;
  consoleErrors?: string[]; ogImages?: string[]; timings: { loadMs: number };
  blockedReason?: "robots" | "ssrf" | "timeout" | "error";
};
export type Capture = (req: CaptureRequest) => Promise<CaptureResult>;
/** ADR-017: "vercel-sandbox" (production), "serverless-chromium" (fallback, separate secret-free project), "local-playwright" (development), "mock" (fixtures). Screenshot APIs were rejected (no axe results or console errors). */
export type BrowserRuntimeId = "vercel-sandbox" | "serverless-chromium" | "local-playwright" | "mock";
```

## 3. The four initial agents

| Agent | Line | Check | Method | Evidence and source (summary; the per-line audit configuration is in `docs/specs/module-acquisition.md` §3.3, the audit behaviour in §3.7) |
|---|---|---|---|---|
| `audit.web` | WEB_DEVELOPMENT | `web.no_website` | OBSERVED | No domain, or only a social or marketplace URL. Source: the Places or social URL. Severity HIGH. When it fires, the other website checks are `NOT_APPLICABLE`. |
| | | `web.pagespeed_mobile`, `web.pagespeed_desktop` | MEASURED | PageSpeed Insights: performance score, LCP, CLS, INP or TBT, and page weight. Source: the PSI report URL. Poor if LCP > 4 s or score < 50. |
| | | `web.ssl` | MEASURED | HTTPS available, certificate validity and days to expiry, HTTP→HTTPS redirect |
| | | `web.mobile_viewport` | MEASURED | Viewport meta tag, plus a mobile screenshot artifact |
| | | `web.broken_links` | MEASURED | HEAD requests on up to 20 internal links via `safeFetch`: counts and a sample |
| | | `web.seo_basics` | MEASURED | Title, meta description, a single H1, OG tags, sitemap, robots |
| | | `web.outdated` | OBSERVED | Copyright year, tech hints, HTTP-only forms |
| | | `web.contact_path` | OBSERVED | Contact or buy reachable within 2 clicks. Evidence: the click path with screenshots |
| | | `web.visual_first_impression` (optional) | AI_JUDGED | Vision on the mobile and desktop screenshots. Cites artifact keys |
| `audit.uiux` | UI_UX_DESIGN | `uiux.app_reviews` | AI_JUDGED over MEASURED data | App Store reviews via RSS: rating distribution, trend, and usability themes. Cites review IDs |
| | | `uiux.onboarding_capture` | OBSERVED | Landing page, then navigation by visible text ("Sign up", "Get started"), never typing. Steps and fields visible |
| | | `uiux.heuristics` | AI_JUDGED | Vision over the captured steps. Cites screenshot keys |
| | | `uiux.accessibility` | MEASURED | axe on the landing page: counts by impact and top violations |
| | | `uiux.mobile_layout` | MEASURED | Horizontal overflow, tap-target spacing and font sizes on the mobile capture |
| `audit.graphic` | GRAPHIC_DESIGN | `graphic.brand_surfaces` | OBSERVED | Public brand images without login: logo, hero, `og:image`, favicon, YouTube avatar and banner. Each stored as an artifact with its source URL |
| | | `graphic.consistency` | AI_JUDGED | Vision over the collected surfaces: logo, palette, typography, image quality. Names the surfaces compared |
| | | `graphic.logo_quality` | MEASURED + AI_JUDGED | Resolution and format of the logo files, plus a distortion or low-resolution flag |
| | | `graphic.social_presence_fit` | OBSERVED | Platforms present, and whether profile images match across them |
| `audit.video` | VIDEO_EDITING | `video.cadence` | MEASURED | Uploads in the last 30, 90 and 180 days, the longest gap and the trend. `gone_quiet` when the gap is growing and the last upload is more than 45 days old |
| | | `video.captions` | MEASURED | Share of the last 20 videos with captions (`contentDetails.caption`) |
| | | `video.duration_profile` | MEASURED | Average and spread of duration, and the Shorts versus long-form mix |
| | | `video.engagement` | MEASURED | Views per video versus subscribers, and the trend. Framed respectfully |
| | | `video.thumbnails` | AI_JUDGED | Vision over the last 12 thumbnails. Cites thumbnail URLs |
| | | `video.titles_hooks` (optional) | AI_JUDGED | Title patterns and hook quality, from titles only |

Instagram and TikTok have no compliant public data source here. Checks that would need them record `NOT_ASSESSED` with the reason "not assessed: no compliant data source" (INV-14).

## 4. Rules

1. **Evidence or nothing (INV-18).** Every finding stores structured `evidence` plus a `sourceUrl` or an `artifactKey`. A finding the evidence doesn't support is a bug.
2. **Measured claims come from templates.** For `MEASURED` checks, `claim` is generated from the measured values, for example: "Your homepage took {LCP}s to show its main content on mobile in our test on {date}." Free text is never used for measured claims.
3. **AI-judged findings.** Each one cites `evidence.referenceIds` taken only from the task input: artifact keys, review IDs or thumbnail URLs. After every AI call the agent drops any finding whose references aren't in the input, and logs it. Findings below 0.7 confidence are never `pitchable`.
4. **Checks are independent.** A failing check produces `CHECK_FAILED` with a reason and never crashes the audit. `NOT_APPLICABLE` (for example no website) and `NOT_ASSESSED` (no compliant source) are honest, visible outcomes.
5. **Orchestration.** `runAudits(leadId)` moves the lead `ENRICHED → AUDITING`, runs the profile's configured agents and checks within the per-lead cost cap, and stores one `Audit` row per agent plus its `AuditCheckRun` and `AuditFinding` rows.
   - When every required check is `OK` or `NOT_APPLICABLE`, the lead moves `AUDITING → AUDITED`.
   - When a required check fails, it retries. After N failures the lead goes back to `ENRICHED` and is flagged for manual review.
   - Either way, `audit.completed` is emitted.
6. **Caching.** Domain-level results (PageSpeed, captures) are reused within the TTL (default 7 days) across lines and leads for the same company, unless `force` is set.
7. **Dismissal.** `dismissFinding(actor, findingId, reason)` sets `dismissedAt`. A dismissed finding can't be cited, and any message citing one can't be approved or sent (INV-18).
8. **Browser safety** is enforced in code:
   - `robots.txt` and the SSRF guard run before any capture.
   - Actions allow only navigation by visible text and scrolling. The browser never types, submits forms, logs in, or accepts cookie banners beyond closing them.
   - Each capture runs in one browser context, closed afterwards, with a hard 20-second timeout.
   - Screenshots are stored privately as WebP with purpose `AUDIT_SCREENSHOT` and a retention period (`platform.retention.screenshotsDays`, default 90).
9. **Respectful tone.** Criticism is specific and never insulting. Severity follows the thresholds in the line reference file (`runtime-skills/acquisition/_references/lines/*.md`).

## 5. Worked example

```ts
AuditFindingInputSchema.parse({
  checkId: "web.pagespeed_mobile",
  severity: "HIGH",
  claim: "Your homepage took 7.2s to show its main content on mobile in our test on 3 Oct 2026.",
  evidence: { metrics: { lcpSeconds: 7.2, performanceScore: 34, cls: 0.31, totalBytes: 4812000 }, thresholds: { lcpSeconds: 4, performanceScore: 50 } },
  sourceUrl: "https://pagespeed.web.dev/analysis?url=https%3A%2F%2Fexample.com.ng%2F&form_factor=mobile",
  capturedAt: "2026-10-03T09:40:00Z",
  method: "MEASURED",
  confidence: 1,
  pitchable: true,
});
```

## 6. Invalid example (Phase 2 test)

```ts
AuditFindingInputSchema.safeParse({
  checkId: "graphic.consistency", severity: "MEDIUM",
  claim: "Your brand looks inconsistent across channels.",
  evidence: {}, capturedAt: "2026-10-03T09:40:00Z", method: "AI_JUDGED", confidence: 0.55, pitchable: true,
});
// → fails: ["sourceUrl"] needs a sourceUrl or an artifactKey; ["pitchable"] AI-judged below 0.7 can't be pitchable;
//   ["evidence","referenceIds"] AI-judged findings must cite input references
```
