import { z } from "zod";

/** One eval case on disk (evals/<module>/<task>/cases/*.json). */
export const EvalCaseSchema = z.object({
  id: z.string().min(1),
  description: z.string().optional(),
  input: z.unknown(),
  expectations: z.object({
    schemaValid: z.boolean().optional(),
    mustMention: z.array(z.string()).optional(),
    mustNotMention: z.array(z.string()).optional(),
    citedEvidenceIds: z.array(z.string()).optional(),
    bannedPhrases: z.array(z.string()).optional(),
    exactMatch: z.record(z.string(), z.unknown()).optional(),
    /** LLM-judge rubric (invokes platform.eval-judge with this string). */
    rubric: z.string().optional(),
    /** Minimum judge score to pass (0..1); defaults to 0.7 when rubric is set. */
    rubricPassScore: z.number().min(0).max(1).optional(),
  }),
});
export type EvalCase = z.infer<typeof EvalCaseSchema>;

export interface CheckResult {
  name: string;
  pass: boolean;
  message?: string;
}

export interface CaseResult {
  id: string;
  pass: boolean;
  checks: CheckResult[];
  latencyMs: number;
  costMicros: number;
}

export interface EvalReport {
  task: string;
  version: number | "active";
  live: boolean;
  ranAt: string;
  totalCases: number;
  passed: number;
  score: number; // passed / totalCases
  totalCostMicros: number;
  cases: CaseResult[];
}
