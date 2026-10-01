/**
 * Pipeline AI tasks (Phase 14, module spec §3.15). Registered on the acquisition manifest by Phase
 * 19 through `phases/14/REQUESTS.md`. Imports `defineTask` from `@/platform/ai/define` and
 * `registerTask` from `@/platform/ai/registry` (never the `@/platform/ai` barrel) to avoid the
 * manifest import cycle.
 *
 * - pre-call brief (balanced): the price range is taken from the profile, not invented; claims cite findings.
 * - meeting summary (balanced): extracts only what the notes/transcript (an untrusted data block, INV-24) say.
 * - proposal draft (deep): restates the already-computed figures; the number-consistency check (./proposals/number-check) rejects any other number; claims cite findings or meeting facts.
 */

import { z } from "zod";

import {
  MeetingSummarySchema,
  PrecallBriefSchema,
  ProposalSectionsSchema,
} from "@/contracts/acquisition-records";
import { CurrencySchema, MarketSchema, MinorUnitsSchema, ServiceLineSchema } from "@/contracts/common";
import { selectAcquisitionReferences } from "@/modules/acquisition/profiles";
import { defineTask } from "@/platform/ai/define";
import { registerTask } from "@/platform/ai/registry";

function references(input: { serviceLine: z.infer<typeof ServiceLineSchema>; market: z.infer<typeof MarketSchema> }) {
  return selectAcquisitionReferences({ serviceLine: input.serviceLine, market: input.market }).map((r) => ({
    path: r.path,
    optional: true,
  }));
}

const FindingSchema = z.object({ id: z.string(), claim: z.string().max(400) });
const PackageRangeSchema = z.object({
  id: z.string(),
  name: z.string(),
  minMinor: MinorUnitsSchema,
  typicalMinor: MinorUnitsSchema,
  maxMinor: MinorUnitsSchema,
  currency: CurrencySchema,
});
const PortfolioRefSchema = z.object({ title: z.string(), outcomeMetric: z.string().nullable() });

// ---- Pre-call brief -------------------------------------------------------
export const PrecallBriefInputSchema = z.object({
  serviceLine: ServiceLineSchema,
  market: MarketSchema,
  companyName: z.string(),
  leadBrief: z.string().nullable(),
  findings: z.array(FindingSchema).max(20),
  conversation: z.array(z.object({ from: z.enum(["us", "them"]), text: z.string().max(4000) })).max(40),
  packages: z.array(PackageRangeSchema).max(12),
  portfolio: z.array(PortfolioRefSchema).max(8),
  priceRange: z
    .object({ minMinor: MinorUnitsSchema, maxMinor: MinorUnitsSchema, currency: CurrencySchema })
    .nullable(),
});
export type PrecallBriefInput = z.infer<typeof PrecallBriefInputSchema>;

export const precallBriefTask = defineTask({
  id: "acquisition.pipeline-precall-brief",
  module: "acquisition",
  description: "Prepare a one-page pre-call brief before a meeting: what they care about, likely needs, questions, a suggested package and the price range to discuss (from the profile).",
  skillPath: "acquisition/pipeline-precall-brief",
  sharedSkills: ["_shared/futureuni-voice"],
  references,
  inputSchema: PrecallBriefInputSchema,
  outputSchema: PrecallBriefSchema,
  modelTier: "balanced",
  defaultMaxTokens: 1_400,
  defaultTemperature: 0.3,
  vision: false,
  cacheableSystem: true,
  piiPolicy: { allowedPersonalFields: ["conversation"] },
  claims: { textPaths: ["summary"], evidenceInputPath: "findings", requireAtLeastOne: false },
  logContent: "none",
  timeoutMs: 60_000,
  evalSuite: "evals/acquisition/pipeline-precall-brief",
  mockFixture: "evals/acquisition/pipeline-precall-brief/fixtures/mock.json",
});

// ---- Meeting summary ------------------------------------------------------
export const MeetingSummaryInputSchema = z.object({
  serviceLine: ServiceLineSchema,
  market: MarketSchema,
  companyName: z.string(),
  /** Notes or a pasted transcript; the skill wraps it in an untrusted data block (INV-24). */
  notes: z.string().max(40_000),
});
export type MeetingSummaryInput = z.infer<typeof MeetingSummaryInputSchema>;

export const meetingSummaryTask = defineTask({
  id: "acquisition.pipeline-meeting-summary",
  module: "acquisition",
  description: "Summarise a meeting from notes or a pasted transcript: needs, budget signals, decision makers, objections, next steps and recommended packages. Extracts only what the notes say.",
  skillPath: "acquisition/pipeline-meeting-summary",
  sharedSkills: ["_shared/futureuni-voice"],
  references,
  inputSchema: MeetingSummaryInputSchema,
  outputSchema: MeetingSummarySchema,
  modelTier: "balanced",
  defaultMaxTokens: 1_400,
  defaultTemperature: 0.2,
  vision: false,
  cacheableSystem: true,
  piiPolicy: { allowedPersonalFields: ["notes"] },
  logContent: "none",
  timeoutMs: 60_000,
  evalSuite: "evals/acquisition/pipeline-meeting-summary",
  mockFixture: "evals/acquisition/pipeline-meeting-summary/fixtures/mock.json",
});

// ---- Proposal draft -------------------------------------------------------
export const ProposalDraftInputSchema = z.object({
  serviceLine: ServiceLineSchema,
  market: MarketSchema,
  companyName: z.string(),
  leadBrief: z.string().nullable(),
  meetingSummary: z.string().nullable(),
  findings: z.array(FindingSchema).max(20),
  packages: z.array(
    z.object({ name: z.string(), quantity: z.int().min(1), unitPriceMinor: MinorUnitsSchema }),
  ),
  lineItems: z.array(z.object({ description: z.string(), quantity: z.int().min(1), unitPriceMinor: MinorUnitsSchema })),
  totals: z.object({
    subtotalMinor: MinorUnitsSchema,
    discountMinor: MinorUnitsSchema,
    taxMinor: MinorUnitsSchema,
    totalMinor: MinorUnitsSchema,
    currency: CurrencySchema,
  }),
  catalogue: z.array(z.object({ name: z.string(), includes: z.array(z.string()) })).max(12),
  portfolio: z.array(PortfolioRefSchema).max(8),
  timelineSummary: z.string().max(400),
  validUntil: z.string(), // "25 Oct 2026"
});
export type ProposalDraftInput = z.infer<typeof ProposalDraftInputSchema>;

export const proposalDraftTask = defineTask({
  id: "acquisition.pipeline-proposal-draft",
  module: "acquisition",
  description: "Write the prose for each section of a proposal PDF from the already-computed figures. Numbers must equal the supplied figures; claims about the client cite findings or meeting facts.",
  skillPath: "acquisition/pipeline-proposal-draft",
  sharedSkills: ["_shared/futureuni-voice"],
  references,
  inputSchema: ProposalDraftInputSchema,
  outputSchema: ProposalSectionsSchema,
  modelTier: "deep",
  defaultMaxTokens: 3_000,
  defaultTemperature: 0.4,
  vision: false,
  cacheableSystem: true,
  piiPolicy: { allowedPersonalFields: [] },
  claims: { textPaths: ["understanding"], evidenceInputPath: "findings", requireAtLeastOne: false },
  logContent: "none",
  timeoutMs: 120_000,
  evalSuite: "evals/acquisition/pipeline-proposal-draft",
  mockFixture: "evals/acquisition/pipeline-proposal-draft/fixtures/mock.json",
});

export const pipelineTasks = [precallBriefTask, meetingSummaryTask, proposalDraftTask] as const;

/** Registers the pipeline tasks directly (tests and evals, before Phase 19 wires the manifest). */
export function registerPipelineTasks(): void {
  for (const task of pipelineTasks) registerTask(task);
}
