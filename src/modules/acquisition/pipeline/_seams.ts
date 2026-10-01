/**
 * Phase 14 consumes three seams provided by Phases 11 and 12, which run in parallel. Per the seam
 * rule (CLAUDE.md §"Running phase prompts"), these are stand-ins built to the exact signatures in
 * `docs/prompts/wave-3-prep-and-merge.md` Part B2. At Wave-3 integration the real implementations
 * replace them and this file is deleted (see `phases/14/REQUESTS.md`).
 *
 * The stand-ins keep their database work in `pipeline.repo.ts`, so no non-repo file touches Prisma.
 */

import "server-only";

import type { Actor, EnrollmentStopReason } from "@/contracts/common";
import { AppError } from "@/lib/errors";
import { withTransaction, type Tx } from "@/platform/db";
import { makeLogger } from "@/platform/jobs";

import {
  createMockOneOff,
  getLeadBriefFields,
  getLeadScope,
  stopEnrollmentsDirect,
} from "./pipeline.repo";

const log = makeLogger("seam-stand-in", "acquisition.pipeline._seams");

export interface LeadBrief {
  brief: string | null;
  keyFindingIds: string[];
  suggestedAngleId: string | null;
  score: number | null;
  scoreReasons: { ruleId: string; points: number; label: string }[];
}

// SEAM:SEAM-LEAD-BRIEF — provided by Phase 11 (scoring). Stand-in reads Lead.brief + Lead.scoreReasons.
export async function getLeadBrief(leadId: string): Promise<LeadBrief> {
  const row = await getLeadBriefFields(leadId);
  if (row === null) {
    return { brief: null, keyFindingIds: [], suggestedAngleId: null, score: null, scoreReasons: [] };
  }
  return {
    brief: row.brief,
    keyFindingIds: row.keyFindingIds,
    suggestedAngleId: row.suggestedAngleId,
    score: row.score,
    scoreReasons: parseScoreReasons(row.scoreReasons),
  };
}

function parseScoreReasons(value: unknown): LeadBrief["scoreReasons"] {
  if (!Array.isArray(value)) return [];
  const out: LeadBrief["scoreReasons"] = [];
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) continue;
    const record = entry as Record<string, unknown>;
    if (
      typeof record.ruleId === "string" &&
      typeof record.points === "number" &&
      typeof record.label === "string"
    ) {
      out.push({ ruleId: record.ruleId, points: record.points, label: record.label });
    }
  }
  return out;
}

// SEAM:SEAM-STOP-SEQUENCE — provided by Phase 12 (outreach). Stand-in sets ACTIVE/PAUSED enrolments to STOPPED.
export async function stopEnrollments(
  tx: Tx | null,
  scope: { leadId?: string; contactId?: string; companyId?: string },
  reason: EnrollmentStopReason,
): Promise<{ stopped: number }> {
  const now = new Date();
  const run = (client: Tx): Promise<number> => stopEnrollmentsDirect(client, scope, reason, now);
  const stopped = tx === null ? await withTransaction((client) => run(client)) : await run(tx);
  return { stopped };
}

export interface SendOneOffInput {
  leadId: string;
  contactId: string;
  subject: string;
  body: string;
  inReplyToMessageId?: string;
  attachments?: { fileKey: string; filename: string }[];
  humanConfirmedClaims: boolean;
}

// SEAM:SEAM-SEND-ONEOFF — provided by Phase 12 (outreach). Stand-in writes a SENT_MOCK Message and logs.
export async function sendOneOffEmail(actor: Actor, input: SendOneOffInput): Promise<{ messageId: string }> {
  const scope = await getLeadScope(input.leadId);
  if (scope === null) throw new AppError("NOT_FOUND", "That lead doesn't exist.");
  const sentById = actor.type === "USER" ? actor.userId : null;
  const messageId = await withTransaction((client) =>
    createMockOneOff(client, {
      leadId: input.leadId,
      companyId: scope.companyId,
      contactId: input.contactId,
      subject: input.subject,
      body: input.body,
      sentById,
      at: new Date(),
    }),
  );
  log.info("stand-in sent a one-off email (mock)", {
    leadId: input.leadId,
    messageId,
    attachments: input.attachments?.length ?? 0,
  });
  return { messageId };
}
