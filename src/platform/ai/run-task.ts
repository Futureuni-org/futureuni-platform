import "server-only";

/**
 * Core runTask (ADR-028). One entry point for every AI call.
 *
 * Flow: getTask → validate input → PII strip → resolve model+prompt version → quota check
 * → compose system prompt → provider.call (with retry + breaker) → validate output → one
 * repair attempt → enforce citations → recompute cost from pricing.ts → write AiCall row.
 */

import type {
  AiUsage,
  RunTask,
  RunTaskRequest,
  RunTaskResult,
} from "@/contracts/ai-service";
import { db } from "@/platform/db";
import { AppError } from "@/lib/errors";

import { assertClaimsCited } from "./citations";
import { aiOutputInvalid } from "./errors";
import { buildUsage } from "./pricing";
import { applyPiiPolicy } from "./pii";
import { assertClosed, recordFailure, recordSuccess } from "./providers/circuit-breaker";
import { withRetry } from "./providers/retry";
import { selectProvider } from "./providers/select";
import type { ProviderCallInput } from "./providers/provider";
import { getTask } from "./registry";
import { composeSystemPrompt } from "./skills/loader";
import { wrapUntrusted } from "./skills/delimiter";
import { env } from "@/env";

import { getAiSettings, getProviderKey } from "./_seams";
import { citationInvalid } from "./errors";
import { checkQuotasBeforeCall } from "./quota";
import { buildAiCallInput, writeAiCallRow } from "./usage-log";

/** Value used on AiCall when the task has no published PromptVersion yet. */
const UNVERSIONED = 0;

/** Strips undefined-valued keys so the object is compatible with exactOptionalPropertyTypes. */
function compactContext(
  raw: RunTaskRequest<unknown>["context"] | undefined,
): { module?: string; leadId?: string; companyId?: string; jobRunId?: string } {
  if (raw === undefined) return {};
  const out: { module?: string; leadId?: string; companyId?: string; jobRunId?: string } = {};
  if (raw.module !== undefined) out.module = raw.module;
  if (raw.leadId !== undefined) out.leadId = raw.leadId;
  if (raw.companyId !== undefined) out.companyId = raw.companyId;
  if (raw.jobRunId !== undefined) out.jobRunId = raw.jobRunId;
  return out;
}

/** Look up the active prompt version number; null when none has been published yet. */
async function resolveActivePromptVersion(taskId: string): Promise<number | null> {
  const row = await db.promptVersion.findFirst({
    where: { task: taskId, isActive: true },
    select: { version: true },
  });
  return row?.version ?? null;
}

export const runTask: RunTask = async <TInput, TOutput>(
  req: RunTaskRequest<TInput>,
): Promise<RunTaskResult<TOutput>> => {
  const task = getTask(req.task);

  // 1. Validate input.
  const parsedInput = task.inputSchema.safeParse(req.input);
  if (!parsedInput.success) {
    throw new AppError("VALIDATION_FAILED", "AI task input failed validation", {
      details: { task: task.id, issues: parsedInput.error.issues },
    });
  }
  const input = parsedInput.data;

  // 2. PII minimisation (INV-13).
  const cleanInput = applyPiiPolicy(input, task.piiPolicy);

  // 3. Settings + model tier.
  const settings = await getAiSettings();
  const primaryModel = settings.modelTiers[task.modelTier];
  const fallbackModel = settings.fallbackModels[task.modelTier];

  // 4. Resolve provider key + kind now so QUOTA_BLOCKED logs the real provider we'd have
  //    used (not a hardcoded "mock").
  const apiKey = await getProviderKey("anthropic");
  const providerKind: "anthropic" | "mock" = env.MOCKS || apiKey === null ? "mock" : "anthropic";

  // 5. Quota gate (throws AI_QUOTA_EXCEEDED / writes AiCall as QUOTA_BLOCKED if it fires).
  try {
    await checkQuotasBeforeCall({
      actor: req.actor,
      ...(req.context?.module === undefined ? {} : { module: req.context.module }),
      now: new Date(),
      settings,
    });
  } catch (err) {
    if (err instanceof AppError && err.code === "AI_QUOTA_EXCEEDED") {
      await writeAiCallRow(
        buildAiCallInput({
          task: task.id,
          promptVersion: UNVERSIONED,
          model: primaryModel,
          provider: providerKind,
          actor: req.actor,
          context: compactContext(req.context),
          usage: emptyUsage(),
          outcome: "QUOTA_BLOCKED",
          errorCode: err.code,
          logContent: "NONE",
        }),
      );
    }
    throw err;
  }

  // 6. Prompt version resolution.
  const version = req.options?.promptVersion ?? (await resolveActivePromptVersion(task.id));
  const versionNumber = version ?? UNVERSIONED;

  // 7. Compose system.
  const composed = await composeSystemPrompt(task, cleanInput);

  // 8. Provider selection + provider call.
  const provider = selectProvider({
    fixturePath: task.mockFixture,
    hashKey: cleanInput,
    apiKey,
  });
  const currentModel = primaryModel;

  const providerInput = buildProviderInput({
    model: currentModel,
    system: composed.blocks,
    userMessage: buildUserMessage(cleanInput, req.images),
    task,
    options: req.options,
  });

  // 8. Call with retry + breaker.
  assertClosed(provider.kind);
  let providerResult;
  try {
    providerResult = await withRetry(() => provider.call(providerInput));
    recordSuccess(provider.kind);
  } catch (err) {
    recordFailure(provider.kind);
    // Fallback: one attempt on the tier's fallback model, if configured.
    if (fallbackModel !== undefined && provider.kind === "anthropic") {
      try {
        providerResult = await provider.call({ ...providerInput, model: fallbackModel });
        recordSuccess(provider.kind);
      } catch (fbErr) {
        recordFailure(provider.kind);
        await writeAiCallRow(
          buildAiCallInput({
            task: task.id,
            promptVersion: versionNumber,
            model: fallbackModel,
            provider: provider.kind,
            actor: req.actor,
            context: compactContext(req.context),
            usage: emptyUsage(),
            outcome: mapToOutcome(fbErr),
            errorCode: extractCode(fbErr),
            logContent: "NONE",
          }),
        );
        throw fbErr;
      }
    } else {
      await writeAiCallRow(
        buildAiCallInput({
          task: task.id,
          promptVersion: versionNumber,
          model: currentModel,
          provider: provider.kind,
          actor: req.actor,
          context: compactContext(req.context),
          usage: emptyUsage(),
          outcome: mapToOutcome(err),
          errorCode: extractCode(err),
          logContent: "NONE",
        }),
      );
      throw err;
    }
  }

  // 9. Validate output against outputSchema.
  let parsedOut = task.outputSchema.safeParse(providerResult.parsedOutput);
  let outcome: "OK" | "REPAIRED" | "INVALID" = "OK";

  if (!parsedOut.success) {
    // Repair attempt: send back the issues and ask again.
    const repairMessage = buildRepairMessage(providerResult.rawText, parsedOut.error.issues);
    const repairInput: ProviderCallInput = {
      ...providerInput,
      messages: [
        ...providerInput.messages,
        { role: "user", content: [{ type: "text", text: repairMessage }] },
      ],
    };
    let repairResult;
    try {
      repairResult = await provider.call(repairInput);
    } catch (err) {
      await writeAiCallRow(
        buildAiCallInput({
          task: task.id,
          promptVersion: versionNumber,
          model: currentModel,
          provider: provider.kind,
          actor: req.actor,
          context: compactContext(req.context),
          usage: providerResult.usage,
          outcome: "ERROR",
          errorCode: extractCode(err),
          logContent: "NONE",
        }),
      );
      throw err;
    }
    parsedOut = task.outputSchema.safeParse(repairResult.parsedOutput);
    if (!parsedOut.success) {
      const usage = mergeUsage(providerResult.usage, repairResult.usage);
      const finalUsage = withCostFromPricing(providerResult, repairResult, usage.latencyMs, primaryModel);
      await writeAiCallRow(
        buildAiCallInput({
          task: task.id,
          promptVersion: versionNumber,
          model: currentModel,
          provider: provider.kind,
          actor: req.actor,
          context: compactContext(req.context),
          usage: finalUsage,
          outcome: "INVALID",
          errorCode: "AI_OUTPUT_INVALID",
          logContent: "NONE",
        }),
      );
      throw aiOutputInvalid({ issues: parsedOut.error.issues });
    }
    outcome = "REPAIRED";
    providerResult = { ...repairResult, parsedOutput: parsedOut.data };
  }

  // 10. Recompute cost from pricing.ts (mock returns 0 costMicros; real returns 0 too).
  const usage: AiUsage = buildUsage(
    currentModel,
    {
      inputTokens: providerResult.usage.inputTokens,
      outputTokens: providerResult.usage.outputTokens,
      cacheReadTokens: providerResult.usage.cacheReadTokens,
      // The adapter merges 5m and 1h cache writes; assume all 5m for cost purposes when
      // we cannot tell them apart. This is conservative (5m is cheaper than 1h).
      cacheWrite5mTokens: providerResult.usage.cacheWriteTokens,
      cacheWrite1hTokens: 0,
    },
    providerResult.usage.latencyMs,
  );

  // 11. Citation enforcement, if the task declares a claims policy. INV-13 requires an
  //     AiCall row for EVERY terminal state (including blocked and failed), so we log
  //     before rethrowing when the check fails — the model call already cost money.
  if (task.claims !== undefined) {
    try {
      enforceCitations(task, cleanInput, parsedOut.data);
    } catch (err) {
      await writeAiCallRow(
        buildAiCallInput({
          task: task.id,
          promptVersion: versionNumber,
          model: currentModel,
          provider: provider.kind,
          actor: req.actor,
          context: compactContext(req.context),
          usage,
          outcome: "INVALID",
          errorCode: err instanceof AppError ? err.code : "CITATION_INVALID",
          stopReason: providerResult.stopReason,
          logContent: task.logContent.toUpperCase() as "NONE" | "REDACTED" | "FULL",
        }),
      );
      throw err instanceof AppError
        ? err
        : citationInvalid({ reason: err instanceof Error ? err.message : "unknown" });
    }
  }

  // 12. Log the successful terminal state.
  const written = await writeAiCallRow(
    buildAiCallInput({
      task: task.id,
      promptVersion: versionNumber,
      model: currentModel,
      provider: provider.kind,
      actor: req.actor,
      context: compactContext(req.context),
      usage,
      outcome,
      stopReason: providerResult.stopReason,
      logContent: task.logContent.toUpperCase() as "NONE" | "REDACTED" | "FULL",
    }),
  );

  return {
    output: parsedOut.data as TOutput,
    usage,
    callId: written.id,
    promptVersion: versionNumber,
    model: currentModel,
    cached: providerResult.cached,
  };
};

function emptyUsage(): AiUsage {
  return {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    costMicros: 0,
    latencyMs: 0,
  };
}

function mergeUsage(a: AiUsage, b: AiUsage): AiUsage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    cacheReadTokens: a.cacheReadTokens + b.cacheReadTokens,
    cacheWriteTokens: a.cacheWriteTokens + b.cacheWriteTokens,
    costMicros: a.costMicros + b.costMicros,
    latencyMs: a.latencyMs + b.latencyMs,
  };
}

function withCostFromPricing(
  a: { usage: AiUsage },
  b: { usage: AiUsage },
  totalLatencyMs: number,
  model: string,
): AiUsage {
  return buildUsage(
    model,
    {
      inputTokens: a.usage.inputTokens + b.usage.inputTokens,
      outputTokens: a.usage.outputTokens + b.usage.outputTokens,
      cacheReadTokens: a.usage.cacheReadTokens + b.usage.cacheReadTokens,
      cacheWrite5mTokens: a.usage.cacheWriteTokens + b.usage.cacheWriteTokens,
      cacheWrite1hTokens: 0,
    },
    totalLatencyMs,
  );
}

function mapToOutcome(err: unknown): "TIMEOUT" | "ERROR" | "INVALID" {
  const code = extractCode(err);
  if (code === "AI_TIMEOUT") return "TIMEOUT";
  if (code === "AI_OUTPUT_INVALID") return "INVALID";
  return "ERROR";
}

function extractCode(err: unknown): string {
  if (err instanceof AppError) return err.code;
  return "AI_PROVIDER_ERROR";
}

function buildRepairMessage(
  previousOutput: string,
  issues: readonly { path: readonly PropertyKey[]; message: string }[],
): string {
  const lines = issues
    .map((i) => `- ${i.path.map(String).join(".")}: ${i.message}`)
    .join("\n");
  return `Your previous JSON output was invalid. Return corrected JSON.\n\nPrevious output:\n${previousOutput}\n\nValidation issues:\n${lines}`;
}

function buildUserMessage<TInput>(
  input: TInput,
  images: RunTaskRequest<TInput>["images"] | undefined,
): ProviderCallInput["messages"][number] {
  const dataText = wrapUntrusted({
    kind: "task-input",
    id: "input-1",
    text: JSON.stringify(input, null, 2),
  });
  const content: ProviderCallInput["messages"][number]["content"] = [
    { type: "text", text: dataText },
  ];
  if (images !== undefined) {
    for (const image of images) content.push({ type: "image", image });
  }
  return { role: "user", content };
}

function buildProviderInput<TInput>(args: {
  model: string;
  system: readonly { text: string; cache: boolean }[];
  userMessage: ProviderCallInput["messages"][number];
  task: ReturnType<typeof getTask>;
  options: RunTaskRequest<TInput>["options"];
}): ProviderCallInput {
  return {
    model: args.model,
    system: args.system.map((s) => ({ text: s.text, cache: s.cache })),
    messages: [args.userMessage],
    maxTokens: args.options?.maxTokens ?? args.task.defaultMaxTokens,
    ...(args.options?.temperature === undefined
      ? args.task.defaultTemperature === undefined
        ? {}
        : { temperature: args.task.defaultTemperature }
      : { temperature: args.options.temperature }),
    ...(args.task.effort === undefined ? {} : { effort: args.task.effort }),
    timeoutMs: args.options?.timeoutMs ?? args.task.timeoutMs,
    outputSchema: args.task.outputSchema,
  };
}

function enforceCitations(
  task: ReturnType<typeof getTask>,
  input: unknown,
  output: unknown,
): void {
  if (task.claims === undefined) return;
  const texts = getPathValues(output, task.claims.textPaths).filter(
    (v): v is string => typeof v === "string",
  );
  const evidenceContainer = getPathValues(input, [task.claims.evidenceInputPath])[0];
  const allowed = extractEvidenceIds(evidenceContainer);
  assertClaimsCited(texts, allowed, { requireAtLeastOne: task.claims.requireAtLeastOne });
}

function getPathValues(root: unknown, paths: readonly string[]): unknown[] {
  return paths.map((path) => {
    let cursor: unknown = root;
    for (const key of path.split(".")) {
      if (cursor === null || typeof cursor !== "object") return undefined;
      cursor = (cursor as Record<string, unknown>)[key];
    }
    return cursor;
  });
}

function extractEvidenceIds(container: unknown): string[] {
  if (!Array.isArray(container)) return [];
  return container
    .map((item) =>
      typeof item === "object" && item !== null
        ? (item as { id?: unknown }).id
        : undefined,
    )
    .filter((id): id is string => typeof id === "string");
}
