/**
 * Scoring AI tasks (Phase 11): the borderline review and the lead brief. Registered on the
 * acquisition manifest by Phase 19 through `phases/11/REQUESTS.md` (same pattern as enrichment and
 * audits). References come from `selectAcquisitionReferences` (imported from the profiles `resolve`
 * module directly, not the barrel, to avoid the manifest import cycle). Untrusted finding evidence
 * is wrapped by runTask itself (INV-24); the SKILL.md files restate that the data block is data.
 */

import { z } from "zod";

import {
  MarketSchema,
  ReviewRecommendationSchema,
  ScoreBandSchema,
  ServiceLineSchema,
} from "@/contracts/common";
import { selectAcquisitionReferences } from "@/modules/acquisition/profiles/resolve";
import { defineTask } from "@/platform/ai/define";

const FindingInput = z.object({
  id: z.string(),
  checkId: z.string(),
  claim: z.string().max(2_000),
  severity: z.enum(["INFO", "LOW", "MEDIUM", "HIGH", "CRITICAL"]),
  pitchable: z.boolean(),
});
const SignalInput = z.object({ id: z.string(), signalType: z.string() });
const ScoreReasonInput = z.object({ ruleId: z.string(), label: z.string(), points: z.int() });

// ---- score-borderline-review ------------------------------------------------

const BorderlineReviewInput = z.object({
  companyName: z.string().min(1).max(200),
  serviceLine: ServiceLineSchema,
  market: MarketSchema,
  score: z.int().min(0).max(100),
  band: ScoreBandSchema,
  scoreReasons: z.array(ScoreReasonInput).max(60),
  signals: z.array(SignalInput).max(50),
  findings: z.array(FindingInput).max(50),
  disqualifiers: z
    .array(
      z.object({
        id: z.string(),
        label: z.string(),
        description: z.string(),
        aiReviewHint: z.string().optional(),
      }),
    )
    .max(30),
});
export type BorderlineReviewInput = z.infer<typeof BorderlineReviewInput>;

const BorderlineReviewOutput = z.object({
  recommendation: ReviewRecommendationSchema,
  confidence: z.number().min(0).max(1),
  reasons: z.array(z.string().min(1).max(400)).min(1).max(6),
  citedFindingIds: z.array(z.string()).max(10),
  riskFlags: z.array(z.string().max(80)).max(10),
});
export type BorderlineReviewOutput = z.infer<typeof BorderlineReviewOutput>;

export const borderlineReviewTask = defineTask({
  id: "acquisition.score-borderline-review",
  module: "acquisition",
  description:
    "Give a second opinion on a borderline lead: qualify, disqualify or escalate to a human, citing findings.",
  skillPath: "acquisition/score-borderline-review",
  sharedSkills: ["_shared/futureuni-voice"],
  references: (input: BorderlineReviewInput) =>
    selectAcquisitionReferences({ serviceLine: input.serviceLine, market: input.market }),
  inputSchema: BorderlineReviewInput,
  outputSchema: BorderlineReviewOutput,
  modelTier: "balanced",
  defaultMaxTokens: 700,
  defaultTemperature: 0.2,
  vision: false,
  cacheableSystem: true,
  piiPolicy: { allowedPersonalFields: [] },
  logContent: "none",
  timeoutMs: 60_000,
  evalSuite: "evals/acquisition/score-borderline-review",
  mockFixture: "evals/acquisition/score-borderline-review/fixtures/mock.json",
});

// ---- score-lead-brief -------------------------------------------------------

const LeadBriefInput = z.object({
  companyName: z.string().min(1).max(200),
  serviceLine: ServiceLineSchema,
  market: MarketSchema,
  scoreReasons: z.array(ScoreReasonInput).max(60),
  signals: z.array(SignalInput).max(50),
  findings: z.array(FindingInput).max(50),
  angleCandidates: z.array(z.object({ id: z.string(), hook: z.string().max(200) })).max(5),
  crossSell: z.object({
    isLeading: z.boolean(),
    lines: z.array(ServiceLineSchema).max(4),
  }),
});
export type LeadBriefInput = z.infer<typeof LeadBriefInput>;

const LeadBriefOutput = z.object({
  // 2–3 sentences; may carry [[f:<id>]] / [[s:<id>]] citation markers, stripped before storage.
  brief: z.string().min(1).max(800),
  keyFindingIds: z.array(z.string()).max(3),
  suggestedAngleId: z.string().nullable(),
  talkingPoints: z.array(z.string().min(1).max(200)).max(3),
});
export type LeadBriefOutput = z.infer<typeof LeadBriefOutput>;

export const leadBriefTask = defineTask({
  id: "acquisition.score-lead-brief",
  module: "acquisition",
  description:
    "Write a 2–3 sentence lead brief with key findings and a suggested pitch angle, citing only real findings.",
  skillPath: "acquisition/score-lead-brief",
  sharedSkills: ["_shared/futureuni-voice"],
  references: (input: LeadBriefInput) =>
    selectAcquisitionReferences({ serviceLine: input.serviceLine, market: input.market }),
  inputSchema: LeadBriefInput,
  outputSchema: LeadBriefOutput,
  modelTier: "fast",
  defaultMaxTokens: 500,
  defaultTemperature: 0.3,
  vision: false,
  cacheableSystem: true,
  piiPolicy: { allowedPersonalFields: [] },
  claims: { textPaths: ["brief"], evidenceInputPath: "findings", requireAtLeastOne: false },
  logContent: "none",
  timeoutMs: 45_000,
  evalSuite: "evals/acquisition/score-lead-brief",
  mockFixture: "evals/acquisition/score-lead-brief/fixtures/mock.json",
});

export const scoringTasks = [borderlineReviewTask, leadBriefTask] as const;
