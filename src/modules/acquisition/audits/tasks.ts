/**
 * Audit AI tasks (Phase 10). Six tasks, registered on the acquisition manifest by Phase 19 through
 * `phases/10/REQUESTS.md`. Vision tasks use the balanced tier; text classification uses fast
 * (module spec §3.15). Every output is validated for evidence references by `./ai/validate-refs`.
 *
 * Untrusted content (review text, page text) reaches the model only inside the delimited data block
 * the SKILL.md defines; it is data, never instructions (INV-24).
 */

import { defineTask } from "@/platform/ai/define";
import type { Market, ServiceLine } from "@/contracts/common";

import {
  AuditAiOutputSchema,
  GraphicConsistencyInput,
  UiuxHeuristicsInput,
  UiuxReviewAnalysisInput,
  VideoThumbnailsInput,
  VideoTitlesInput,
  WebFirstImpressionInput,
} from "./ai/schemas";

function lineFile(line: ServiceLine): string {
  return `${line.toLowerCase().replace(/_/g, "-")}.md`;
}
function marketFile(market: Market): string {
  return market === "NIGERIA" ? "nigeria.md" : "international.md";
}
function references(input: { serviceLine: ServiceLine; market: Market }): { path: string; optional?: boolean }[] {
  return [
    { path: `acquisition/_references/lines/${lineFile(input.serviceLine)}`, optional: true },
    { path: `acquisition/_references/markets/${marketFile(input.market)}`, optional: true },
  ];
}

export const auditWebFirstImpressionTask = defineTask({
  id: "acquisition.audit-web-first-impression",
  module: "acquisition",
  description: "Optional first-impression judgement of a homepage from its mobile and desktop screenshots.",
  skillPath: "acquisition/audit-web-first-impression",
  sharedSkills: ["_shared/futureuni-voice"],
  references,
  inputSchema: WebFirstImpressionInput,
  outputSchema: AuditAiOutputSchema,
  modelTier: "balanced",
  defaultMaxTokens: 1_200,
  defaultTemperature: 0.2,
  vision: true,
  cacheableSystem: true,
  piiPolicy: { allowedPersonalFields: [] },
  logContent: "none",
  timeoutMs: 90_000,
  evalSuite: "evals/acquisition/audit-web-first-impression",
  mockFixture: "evals/acquisition/audit-web-first-impression/fixtures/mock.json",
});

export const auditUiuxReviewAnalysisTask = defineTask({
  id: "acquisition.audit-uiux-review-analysis",
  module: "acquisition",
  description: "Classify recent App Store reviews into usability themes, quoting the review IDs as evidence.",
  skillPath: "acquisition/audit-uiux-review-analysis",
  sharedSkills: ["_shared/futureuni-voice"],
  references,
  inputSchema: UiuxReviewAnalysisInput,
  outputSchema: AuditAiOutputSchema,
  modelTier: "fast",
  defaultMaxTokens: 1_000,
  defaultTemperature: 0.1,
  vision: false,
  cacheableSystem: true,
  piiPolicy: { allowedPersonalFields: ["reviews"] },
  logContent: "none",
  timeoutMs: 60_000,
  evalSuite: "evals/acquisition/audit-uiux-review-analysis",
  mockFixture: "evals/acquisition/audit-uiux-review-analysis/fixtures/mock.json",
});

export const auditUiuxHeuristicsTask = defineTask({
  id: "acquisition.audit-uiux-heuristics",
  module: "acquisition",
  description: "Apply usability heuristics to captured onboarding steps, citing each screenshot key.",
  skillPath: "acquisition/audit-uiux-heuristics",
  sharedSkills: ["_shared/futureuni-voice"],
  references,
  inputSchema: UiuxHeuristicsInput,
  outputSchema: AuditAiOutputSchema,
  modelTier: "balanced",
  defaultMaxTokens: 1_400,
  defaultTemperature: 0.2,
  vision: true,
  cacheableSystem: true,
  piiPolicy: { allowedPersonalFields: [] },
  logContent: "none",
  timeoutMs: 90_000,
  evalSuite: "evals/acquisition/audit-uiux-heuristics",
  mockFixture: "evals/acquisition/audit-uiux-heuristics/fixtures/mock.json",
});

export const auditGraphicConsistencyTask = defineTask({
  id: "acquisition.audit-graphic-consistency",
  module: "acquisition",
  description: "Assess brand consistency and logo quality across collected brand surfaces, naming each by artifact key.",
  skillPath: "acquisition/audit-graphic-consistency",
  sharedSkills: ["_shared/futureuni-voice"],
  references,
  inputSchema: GraphicConsistencyInput,
  outputSchema: AuditAiOutputSchema,
  modelTier: "balanced",
  defaultMaxTokens: 1_400,
  defaultTemperature: 0.2,
  vision: true,
  cacheableSystem: true,
  piiPolicy: { allowedPersonalFields: [] },
  logContent: "none",
  timeoutMs: 90_000,
  evalSuite: "evals/acquisition/audit-graphic-consistency",
  mockFixture: "evals/acquisition/audit-graphic-consistency/fixtures/mock.json",
});

export const auditVideoThumbnailsTask = defineTask({
  id: "acquisition.audit-video-thumbnails",
  module: "acquisition",
  description: "Judge thumbnail consistency and legibility across recent videos, citing the thumbnail URLs.",
  skillPath: "acquisition/audit-video-thumbnails",
  sharedSkills: ["_shared/futureuni-voice"],
  references,
  inputSchema: VideoThumbnailsInput,
  outputSchema: AuditAiOutputSchema,
  modelTier: "balanced",
  defaultMaxTokens: 1_200,
  defaultTemperature: 0.2,
  vision: true,
  cacheableSystem: true,
  piiPolicy: { allowedPersonalFields: [] },
  logContent: "none",
  timeoutMs: 90_000,
  evalSuite: "evals/acquisition/audit-video-thumbnails",
  mockFixture: "evals/acquisition/audit-video-thumbnails/fixtures/mock.json",
});

export const auditVideoTitlesTask = defineTask({
  id: "acquisition.audit-video-titles",
  module: "acquisition",
  description: "Assess title patterns and hook quality from video titles only, citing the video IDs.",
  skillPath: "acquisition/audit-video-titles",
  sharedSkills: ["_shared/futureuni-voice"],
  references,
  inputSchema: VideoTitlesInput,
  outputSchema: AuditAiOutputSchema,
  modelTier: "fast",
  defaultMaxTokens: 900,
  defaultTemperature: 0.2,
  vision: false,
  cacheableSystem: true,
  piiPolicy: { allowedPersonalFields: [] },
  logContent: "none",
  timeoutMs: 60_000,
  evalSuite: "evals/acquisition/audit-video-titles",
  mockFixture: "evals/acquisition/audit-video-titles/fixtures/mock.json",
});

export const auditTasks = [
  auditWebFirstImpressionTask,
  auditUiuxReviewAnalysisTask,
  auditUiuxHeuristicsTask,
  auditGraphicConsistencyTask,
  auditVideoThumbnailsTask,
  auditVideoTitlesTask,
] as const;
