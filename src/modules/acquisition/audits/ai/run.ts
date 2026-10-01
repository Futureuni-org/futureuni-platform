/**
 * Shared path for AI-judged audit findings: gate on the cost cap, run the task, validate evidence
 * references (dropping any finding that cites something not in the input — contract rule 3), and map
 * the surviving findings to `AuditFindingInput`s. AI calls run as a SYSTEM actor; the AiCall row
 * carries the attribution and cost (INV-13).
 */

import "server-only";

import type { AuditContext, AuditFindingInput } from "@/contracts/audit-agent";
import type { Actor } from "@/contracts/common";
import type { TaskId, RunTaskResult } from "@/contracts/ai-service";
import { getSignedUrl } from "@/platform/storage";

import { keepFindingsWithKnownRefs } from "./validate-refs";
import type { AuditAiFinding, AuditAiOutput } from "./schemas";

const AUDIT_ACTOR: Actor = { type: "SYSTEM", job: "acquisition.audits.lead" };
const SIGNED_URL_TTL_SECONDS = 600;

export interface AiImage {
  artifactKey?: string;
  url: string;
  mediaType: "image/png" | "image/jpeg" | "image/webp" | "image/gif";
}

/** Builds vision inputs (signed URL + artifact key) for a list of stored screenshot keys. */
export async function imagesFromArtifacts(keys: string[]): Promise<AiImage[]> {
  const images: AiImage[] = [];
  for (const key of keys) {
    const url = await getSignedUrl(key, SIGNED_URL_TTL_SECONDS);
    images.push({ artifactKey: key, url, mediaType: "image/webp" });
  }
  return images;
}

export interface AiFindingsResult {
  status: "ok" | "skipped";
  findings: AuditFindingInput[];
  costMicros: number;
}

export async function runAuditAiFindings(
  ctx: AuditContext,
  opts: {
    task: TaskId;
    input: unknown;
    allowedRefs: string[];
    estimatedCostMicros: number;
    images?: AiImage[];
    build: (finding: AuditAiFinding) => AuditFindingInput | null;
  },
): Promise<AiFindingsResult> {
  if (!ctx.costMeter.tryCharge(opts.estimatedCostMicros, `ai:${opts.task}`)) {
    return { status: "skipped", findings: [], costMicros: 0 };
  }

  const result: RunTaskResult<AuditAiOutput> = await ctx.runTask<unknown, AuditAiOutput>({
    task: opts.task,
    input: opts.input,
    actor: AUDIT_ACTOR,
    context: { leadId: ctx.lead.id, module: "acquisition" },
    ...(opts.images === undefined
      ? {}
      : {
          images: opts.images.map((i) => ({
            url: i.url,
            mediaType: i.mediaType,
            ...(i.artifactKey === undefined ? {} : { artifactKey: i.artifactKey }),
          })),
        }),
  });

  const kept = keepFindingsWithKnownRefs(result.output.findings, opts.allowedRefs, ctx.log);
  const findings = kept.map((f) => opts.build(f)).filter((f): f is AuditFindingInput => f !== null);
  return { status: "ok", findings, costMicros: result.usage.costMicros };
}
