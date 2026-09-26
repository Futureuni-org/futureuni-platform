import { describe, expect, it } from "vitest";

import {
  AiSettingsSchema,
  CITATION_MARKER,
  ImageInputSchema,
  TaskDefinitionMetaSchema,
} from "./ai-service";
import { issuePaths } from "./test-helpers";

const validSummarize = {
  id: "platform.summarize-company",
  module: "platform",
  description: "Summarise a company in 2–3 sentences from supplied facts and evidenced signals.",
  skillPath: "platform/summarize-company",
  sharedSkills: ["_shared/futureuni-voice"],
  modelTier: "fast",
  defaultMaxTokens: 600,
  vision: false,
  cacheableSystem: true,
  piiPolicy: { allowedPersonalFields: [] },
  claims: { textPaths: ["summary"], evidenceInputPath: "signals[].id", requireAtLeastOne: true },
  logContent: "none",
  timeoutMs: 30_000,
  evalSuite: "evals/platform/summarize-company",
  mockFixture: "evals/platform/summarize-company/fixtures/mock.json",
};

describe("ai-service contract", () => {
  it("parses the worked example's task definition (docs/contracts/ai-service.md §5)", () => {
    expect(TaskDefinitionMetaSchema.parse(validSummarize).streaming).toBe(false);
  });

  it("rejects the invalid example (§6): id, tier and eval suite", () => {
    const result = TaskDefinitionMetaSchema.safeParse({
      ...validSummarize,
      id: "summarizeCompany",
      modelTier: "turbo",
      evalSuite: "tests/evals",
    });
    expect(issuePaths(result).sort()).toEqual(["evalSuite", "id", "modelTier"]);
  });

  it("finds citation markers for findings and signals", () => {
    const text =
      "Slow homepage [[f:cm1fnd00000000000000000001]] and no site [[s:cm1sig00000000000000000001]].";
    expect([...text.matchAll(CITATION_MARKER)].map((match) => match[1])).toEqual(["f", "s"]);
  });

  it("an image input needs exactly one of url or base64", () => {
    expect(ImageInputSchema.safeParse({ mediaType: "image/png" }).success).toBe(false);
    expect(ImageInputSchema.safeParse({ mediaType: "image/png", base64: "AAAA" }).success).toBe(
      true,
    );
  });

  it("AI settings default the fallback models", () => {
    const settings = AiSettingsSchema.parse({
      modelTiers: { fast: "claude-haiku-4-5", balanced: "claude-sonnet-5", deep: "claude-opus-5" },
      budgets: {
        platformDailyUsd: 5,
        platformMonthlyUsd: 100,
        perModuleDailyUsd: {},
        perUserDailyCalls: 200,
      },
      logContentOverrides: {},
    });
    expect(settings.fallbackModels).toEqual({});
  });
});
