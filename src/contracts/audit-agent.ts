/**
 * Contract: audit agents, findings and the browser runtime (docs/contracts/audit-agent.md).
 * Implemented by Phase 10 (acquisition audits; @/platform/browser).
 */

import { z } from "zod";

import type { RunTask } from "./ai-service";
import {
  AuditStatusSchema,
  CheckRunStatusSchema,
  CostMicrosSchema,
  FindingMethodSchema,
  FindingSeveritySchema,
  HttpUrlSchema,
  Iso8601Schema,
  type MarketSchema,
  type ServiceLineSchema,
  type Clock,
} from "./common";
import type { SafeFetch } from "./enrichment";
import type { ServiceLineProfile } from "./service-line-profile";

export const AuditAgentIdSchema = z.enum([
  "audit.web",
  "audit.uiux",
  "audit.graphic",
  "audit.video",
]);
export type AuditAgentId = z.infer<typeof AuditAgentIdSchema>;

export const AuditCheckIdSchema = z.enum([
  // audit.web (WEB_DEVELOPMENT)
  "web.no_website",
  "web.pagespeed_mobile",
  "web.pagespeed_desktop",
  "web.ssl",
  "web.mobile_viewport",
  "web.broken_links",
  "web.seo_basics",
  "web.outdated",
  "web.contact_path",
  "web.visual_first_impression",
  // audit.uiux (UI_UX_DESIGN)
  "uiux.app_reviews",
  "uiux.onboarding_capture",
  "uiux.heuristics",
  "uiux.accessibility",
  "uiux.mobile_layout",
  // audit.graphic (GRAPHIC_DESIGN)
  "graphic.brand_surfaces",
  "graphic.consistency",
  "graphic.logo_quality",
  "graphic.social_presence_fit",
  // audit.video (VIDEO_EDITING)
  "video.cadence",
  "video.captions",
  "video.duration_profile",
  "video.engagement",
  "video.thumbnails",
  "video.titles_hooks",
]);
export type AuditCheckId = z.infer<typeof AuditCheckIdSchema>;

export const AuditCheckDefinitionSchema = z.object({
  id: AuditCheckIdSchema,
  label: z.string().max(80),
  method: FindingMethodSchema, // MEASURED | OBSERVED | AI_JUDGED
  defaultRequired: z.boolean(),
  aiTask: z.string().optional(), // e.g. "acquisition.audit-uiux-heuristics"
  estimatedCostMicros: CostMicrosSchema,
  cacheScope: z.enum(["domain", "company", "none"]).default("domain"), // reuse across leads within the TTL (default 7 days)
});

// ---------- Findings ----------
/** Structured evidence. Use the fields that fit; measured values go in metrics, quotes carry their source ids. */
export const FindingEvidenceSchema = z.object({
  metrics: z.record(z.string(), z.union([z.number(), z.string(), z.boolean()])).optional(), // { lcpSeconds: 7.2, performanceScore: 34 }
  thresholds: z.record(z.string(), z.number()).optional(), // { lcpSeconds: 4 }
  counts: z.record(z.string(), z.int().nonnegative()).optional(), // { brokenLinks: 3, checked: 20 }
  quotes: z
    .array(
      z.object({
        refId: z.string(),
        text: z.string().max(500),
        sourceUrl: HttpUrlSchema.optional(),
      }),
    )
    .optional(),
  artifacts: z
    .array(
      z.object({
        key: z.string(),
        label: z.string().max(80),
        viewport: z.enum(["mobile", "desktop"]).optional(),
      }),
    )
    .optional(),
  observations: z.array(z.string().max(300)).optional(), // factual, e.g. "No <meta name=viewport> tag"
  referenceIds: z.array(z.string()).optional(), // for AI_JUDGED: artifact keys, review ids, thumbnail URLs from the input only
  sampleSize: z.int().nonnegative().optional(),
  notAssessedReason: z.string().max(200).optional(),
});
export type FindingEvidence = z.infer<typeof FindingEvidenceSchema>;

export const AuditFindingInputSchema = z
  .object({
    checkId: AuditCheckIdSchema,
    severity: FindingSeveritySchema, // CRITICAL | HIGH | MEDIUM | LOW | INFO
    claim: z.string().min(10).max(240), // one precise sentence; for MEASURED checks, generated from a template
    evidence: FindingEvidenceSchema,
    sourceUrl: HttpUrlSchema.optional(),
    artifactKey: z.string().optional(), // FileObject key (purpose AUDIT_SCREENSHOT)
    capturedAt: Iso8601Schema,
    method: FindingMethodSchema,
    confidence: z.number().min(0).max(1),
    pitchable: z.boolean(),
  })
  .refine((f) => f.sourceUrl !== undefined || f.artifactKey !== undefined, {
    error: "A finding needs a sourceUrl or an artifactKey (INV-18)",
    path: ["sourceUrl"],
  })
  .refine((f) => !(f.method === "AI_JUDGED" && f.pitchable && f.confidence < 0.7), {
    error: "AI-judged findings below 0.7 confidence can't be pitchable",
    path: ["pitchable"],
  })
  .refine((f) => !(f.method === "AI_JUDGED" && (f.evidence.referenceIds ?? []).length === 0), {
    error: "AI-judged findings must cite input references",
    path: ["evidence", "referenceIds"],
  });
export type AuditFindingInput = z.infer<typeof AuditFindingInputSchema>;

export const CheckRunResultSchema = z.object({
  checkId: AuditCheckIdSchema,
  status: CheckRunStatusSchema,
  reason: z.string().max(300).optional(), // e.g. "not assessed: no compliant data source (Instagram)"
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
export interface AuditCompanyInput {
  id: string;
  name: string;
  website: string | null;
  normalizedDomain: string | null;
  websiteKind: string;
  country: string | null;
  city: string | null;
  socials: Record<string, string | undefined>;
  techHints: Record<string, unknown> | null;
  externalRefs: { adapterId: string; externalId: string; url?: string }[];
}
export interface AuditContext {
  lead: {
    id: string;
    serviceLine: z.infer<typeof ServiceLineSchema>;
    market: z.infer<typeof MarketSchema>;
    country: string | null;
  };
  profile: ServiceLineProfile; // SEAM-PROFILE until Phase 7 is merged
  requiredChecks: ReadonlySet<AuditCheckId>; // from profile.audits[]
  safeFetch: SafeFetch; // SEAM-SAFE-FETCH until Phase 9 is merged
  capture: Capture; // @/platform/browser
  runTask: RunTask; // @/platform/ai
  storage: {
    putFile(input: {
      key: string;
      body: Uint8Array;
      contentType: string;
      access: "private";
      purpose: "AUDIT_SCREENSHOT";
    }): Promise<{ key: string }>;
  };
  costMeter: { tryCharge(micros: number, label: string): boolean; spentMicros(): number }; // per-lead cap from settings
  cache: {
    get(key: string): Promise<unknown>;
    set(key: string, value: unknown, ttlSeconds: number): Promise<void>;
  };
  clock: Clock;
  signal: AbortSignal;
  force: boolean; // bypass the domain cache
  log: {
    info(msg: string, data?: Record<string, unknown>): void;
    warn(msg: string, data?: Record<string, unknown>): void;
  };
}
export interface AuditAgent {
  id: AuditAgentId;
  serviceLine: z.infer<typeof ServiceLineSchema>;
  checks: z.infer<typeof AuditCheckDefinitionSchema>[];
  run(company: AuditCompanyInput, ctx: AuditContext): Promise<AuditResult>;
}

// ---------- Browser runtime (Phase 10, exact types) ----------
export interface CaptureRequest {
  url: string;
  viewport: "mobile" | "desktop"; // mobile = 390x844 @2x, desktop = 1440x900
  fullPage?: boolean; // default false (above the fold + one scroll)
  waitFor?: "load" | "networkidle"; // default "load", hard timeout 20s
  actions?: ({ type: "click-text"; text: string } | { type: "scroll"; px: number })[]; // navigation only
  collect?: { html?: boolean; axe?: boolean; consoleErrors?: boolean; ogImages?: boolean };
}
export interface CaptureResult {
  ok: boolean;
  finalUrl: string;
  screenshotKey?: string;
  html?: string;
  axeViolations?: { id: string; impact: string; nodes: number; help: string }[];
  consoleErrors?: string[];
  ogImages?: string[];
  timings: { loadMs: number };
  blockedReason?: "robots" | "ssrf" | "timeout" | "error";
}
export type Capture = (req: CaptureRequest) => Promise<CaptureResult>;
/** ADR-017: "vercel-sandbox" (production), "serverless-chromium" (fallback, separate secret-free project), "local-playwright" (development), "mock" (fixtures). Screenshot APIs were rejected (no axe results or console errors). */
export type BrowserRuntimeId =
  "vercel-sandbox" | "serverless-chromium" | "local-playwright" | "mock";
