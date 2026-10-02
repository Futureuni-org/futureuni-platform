import "server-only";

/**
 * Classification orchestration (module spec §3.12): deterministic rules first, then the
 * `acquisition.inbox-classify` model with extraction. Safety bias: any stop-contact request
 * anywhere in the reply forces UNSUBSCRIBE; a sub-threshold confidence flags human review (the
 * sequence is stopped regardless). Untrusted reply text reaches the model only inside the data
 * block the SKILL.md defines (INV-24).
 */

import type { Actor, Market, ReplyClass, ServiceLine } from "@/contracts/common";
import { runTask } from "@/platform/ai";

import { ensureInboxTasksRegistered } from "../tasks";
import type { InboxClassifyInput, InboxClassifyOutput } from "./schemas";
import { classifyDeterministic, detectUnsubscribe } from "./rules";

export interface ClassifyContext {
  serviceLine: ServiceLine;
  market: Market;
  recipientTimezone: string;
  receivedAt: Date;
  fromName: string | null;
  subject: string | null;
  originalMessage: { subject: string | null; text: string } | null;
}

export interface ClassifyResult {
  classification: ReplyClass;
  source: "RULE" | "AI" | "HUMAN";
  confidence: number;
  followUpDate: string | null;
  referral: { name: string | null; email: string | null; role: string | null } | null;
  objectionSummary: string | null;
  questions: string[];
  sentiment: "positive" | "neutral" | "negative";
  language: string;
  summary: string;
  needsHumanReview: boolean;
  aiCallId: string | null;
  bounce: { email: string; kind: "HARD" | "SOFT" } | null;
  returnDateText: string | null;
}

function deterministicResult(classification: ReplyClass, summary: string, extra: Partial<ClassifyResult> = {}): ClassifyResult {
  return {
    classification,
    source: "RULE",
    confidence: 1,
    followUpDate: null,
    referral: null,
    objectionSummary: null,
    questions: [],
    sentiment: "neutral",
    language: "en",
    summary,
    needsHumanReview: false,
    aiCallId: null,
    bounce: null,
    returnDateText: null,
    ...extra,
  };
}

export async function classifyReply(
  reply: { headers: Record<string, string>; fromAddress: string | null; toAddress: string | null; subject: string | null; latestText: string; rawBodySanitized: string | null },
  ctx: ClassifyContext,
  actor: Actor,
  confidenceThreshold: number,
): Promise<ClassifyResult> {
  const fullText = reply.rawBodySanitized ?? reply.latestText;
  const sig = { headers: reply.headers, fromAddress: reply.fromAddress ?? "", subject: reply.subject ?? "" };

  const det = classifyDeterministic(sig, reply.toAddress, reply.latestText, fullText);
  if (det !== null) {
    if (det.classification === "BOUNCE") {
      return deterministicResult("BOUNCE", "Delivery failure", { bounce: det.bounce ?? null });
    }
    if (det.classification === "OUT_OF_OFFICE") {
      return deterministicResult("OUT_OF_OFFICE", "Out of office auto-reply", {
        returnDateText: det.returnDateText ?? null,
      });
    }
    return deterministicResult("UNSUBSCRIBE", "Unsubscribe request");
  }

  // Stage 2: the model.
  ensureInboxTasksRegistered();
  const input: InboxClassifyInput = {
    serviceLine: ctx.serviceLine,
    market: ctx.market,
    originalMessage: ctx.originalMessage,
    reply: {
      fromName: ctx.fromName,
      subject: reply.subject,
      text: reply.latestText,
      receivedAt: ctx.receivedAt.toISOString(),
      recipientTimezone: ctx.recipientTimezone,
    },
  };
  const { output, callId } = await runTask<InboxClassifyInput, InboxClassifyOutput>({
    task: "acquisition.inbox-classify",
    input,
    actor,
    context: {},
  });

  // Safety bias: a stop-contact request anywhere wins, even inside another class.
  const forcedUnsub = detectUnsubscribe(reply.latestText) || output.classification === "UNSUBSCRIBE";
  const classification: ReplyClass = forcedUnsub ? "UNSUBSCRIBE" : output.classification;
  const needsHumanReview = !forcedUnsub && (output.confidence < confidenceThreshold || classification === "OTHER");

  return {
    classification,
    source: "AI",
    confidence: output.confidence,
    followUpDate: output.followUpDate,
    referral: output.referral,
    objectionSummary: output.objectionSummary,
    questions: output.questions,
    sentiment: output.sentiment,
    language: output.language,
    summary: output.summary,
    needsHumanReview,
    aiCallId: callId,
    bounce: null,
    returnDateText: null,
  };
}
