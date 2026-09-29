# src/platform/ai/

**Owner: Phase 05 (AI service).** The platform AI service (`docs/contracts/ai-service.md`).
Every model call goes through `runTask` — this folder is the only importer of
`@anthropic-ai/sdk` (ADR-006, lint-enforced). Model IDs come from configuration
(ADR-018); costs are tracked in integer micro-USD (ADR-027).

## Public API

```ts
import {
  runTask, streamTask, runBatch, getBatchResults,
  registerTask, defineTask, getTask,
  assertClaimsCited, stripCitationMarkers, CITATION_MARKER,
  publishPromptVersion, activatePromptVersion, listPromptVersions, diffPromptVersions,
  getUsageSummary, getCostPerOutcome,
} from "@/platform/ai";
```

## Adding a new AI task — worked example

Every AI task lives in three places: (1) a task definition file, (2) a runtime skill
folder, and (3) an eval suite folder. Below shows the full path for a fictional
`acquisition.outreach-draft`.

### 1. Task definition (owner: the phase that owns the module)

```ts
// src/modules/acquisition/outreach/tasks.ts
import { z } from "zod";
import type { TaskDefinition } from "@/contracts/ai-service";

const InputSchema = z.object({
  companyName: z.string(),
  findings: z.array(z.object({ id: z.string(), text: z.string() })),
});
const OutputSchema = z.object({
  subject: z.string().max(60),
  body: z.string().max(1200),
  citedEvidenceIds: z.array(z.string()),
});

export const outreachDraftTask: TaskDefinition<
  z.infer<typeof InputSchema>,
  z.infer<typeof OutputSchema>
> = {
  id: "acquisition.outreach-draft",
  module: "acquisition",
  description: "Draft an outreach email citing the input findings.",
  skillPath: "acquisition/outreach-draft",
  sharedSkills: ["_shared/futureuni-voice"],
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  modelTier: "balanced",
  defaultMaxTokens: 600,
  defaultTemperature: 0.4,
  vision: false,
  cacheableSystem: true,
  piiPolicy: { allowedPersonalFields: ["contact.firstName"] },
  claims: {
    textPaths: ["body", "subject"],
    evidenceInputPath: "findings",
    requireAtLeastOne: true,
  },
  logContent: "none",
  timeoutMs: 30_000,
  evalSuite: "evals/acquisition/outreach-draft",
  mockFixture: "evals/acquisition/outreach-draft/fixtures/default.json",
};
```

Attach the task to the module's manifest so the AI registry picks it up:

```ts
// src/modules/acquisition/manifest.ts
import { outreachDraftTask } from "./outreach/tasks";
export const manifest = defineModule({
  // …
  aiTasks: [outreachDraftTask as unknown as AnyTaskDefinition],
});
```

### 2. Runtime skill (SKILL.md and optional references/examples)

```
runtime-skills/acquisition/outreach-draft/
  SKILL.md             # the task's role, rules, output shape guidance
  references/*.md      # optional, selected at call time by ReferenceSelector
  examples/*.json      # optional worked input → output pairs
```

The system prompt is composed in this order: shared skills → task SKILL.md →
references (in `ReferenceSelector` order) → examples. The last block becomes the
5-minute cache breakpoint when `cacheableSystem: true`.

### 3. Eval suite (`pnpm evals <taskId>`)

```
evals/acquisition/outreach-draft/
  cases/*.json         # one JSON per case (see evals/_runner/types.ts EvalCase)
  fixtures/default.json  # mock provider's deterministic output
```

Cases can assert: schemaValid, mustMention, mustNotMention, citedEvidenceIds,
bannedPhrases, exactMatch, or a rubric scored by `platform.eval-judge`.

## Call it

```ts
const result = await runTask({
  task: "acquisition.outreach-draft",
  input: { companyName: "Acme", findings: [{ id: "abc…", text: "…" }] },
  actor,
  context: { leadId, companyId, module: "acquisition" },
});
```

`result.output` is validated against `outputSchema`; `result.usage.costMicros` is the
integer micro-USD cost; `result.callId` points at the `AiCall` row written by the
service.

## Seams (Wave 1)

While Phases 3 and 6 are unmerged this folder uses stubs in `_seams.ts`:

- `SEAM-AI-CREDENTIALS` → reads `env.ANTHROPIC_API_KEY`
- `SEAM-SETTINGS-AI`   → builds AiSettings from env variables
- `SEAM-PERMISSION`    → ADMIN allows, SYSTEM always allows, others FORBIDDEN
- `SEAM-AUDIT`         → writes an AuditLog row directly

Wave-1 merge (`docs/prompts/wave-1-prep-and-merge.md` Part C3) replaces each stub
with the real implementation from Phases 3/6. See `phases/05/REQUESTS.md`.
