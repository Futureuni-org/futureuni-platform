/**
 * Shared input/output schemas for the audit AI tasks. Every task returns `{ findings[] }` where each
 * finding carries `evidenceRefs` drawn ONLY from the task input (artifact keys, review IDs or
 * thumbnail URLs). References are validated after the call by `./validate-refs` (contract rule 3).
 */

import { z } from "zod";

import { FindingSeveritySchema, MarketSchema, ServiceLineSchema } from "@/contracts/common";

export const AuditAiFindingSchema = z.object({
  claim: z.string().min(10).max(240),
  evidenceRefs: z.array(z.string().min(1)).min(1).max(12),
  severity: FindingSeveritySchema,
  confidence: z.number().min(0).max(1),
});
export type AuditAiFinding = z.infer<typeof AuditAiFindingSchema>;

export const AuditAiOutputSchema = z.object({
  findings: z.array(AuditAiFindingSchema).max(20),
});
export type AuditAiOutput = z.infer<typeof AuditAiOutputSchema>;

const base = { serviceLine: ServiceLineSchema, market: MarketSchema };

// ---- Per-task input schemas ----

export const WebFirstImpressionInput = z.object({
  ...base,
  pageUrl: z.url(),
  screenshots: z.array(z.object({ viewport: z.enum(["mobile", "desktop"]), artifactKey: z.string().min(1) })).min(1).max(2),
});

export const UiuxReviewAnalysisInput = z.object({
  ...base,
  appName: z.string().max(200),
  reviews: z
    .array(z.object({ id: z.string().min(1), rating: z.int().min(1).max(5), text: z.string().max(2_000) }))
    .min(1)
    .max(30),
});

export const UiuxHeuristicsInput = z.object({
  ...base,
  steps: z.array(z.object({ artifactKey: z.string().min(1), label: z.string().max(80) })).min(1).max(6),
});

export const GraphicConsistencyInput = z.object({
  ...base,
  surfaces: z
    .array(z.object({ artifactKey: z.string().min(1), label: z.string().max(80), sourceUrl: z.url().optional() }))
    .min(1)
    .max(8),
});

export const VideoThumbnailsInput = z.object({
  ...base,
  thumbnails: z.array(z.object({ videoId: z.string().min(1), url: z.url() })).min(1).max(12),
});

export const VideoTitlesInput = z.object({
  ...base,
  titles: z.array(z.object({ videoId: z.string().min(1), title: z.string().max(200) })).min(1).max(20),
});
