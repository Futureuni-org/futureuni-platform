"use server";

/**
 * Server actions for the scoring and cross-sell UI (Phases 15–18). Each follows the saas-api handler
 * shape: authenticate → parse with Zod → delegate to a service (which authorises and audits) →
 * typed ActionResult. The services own the permission checks.
 */

import { z } from "zod";

import { IdSchema } from "@/contracts/common";
import { AppError } from "@/lib/errors";
import { ok, err, type ActionResult } from "@/lib/result";
import { actorOf, requireUser } from "@/platform/auth";
import {
  setLeadingLead as setLeadingLeadService,
  splitGroup as splitGroupService,
} from "@/modules/acquisition/crosssell";

import { assignLead, disqualifyLead } from "./qualify";
import { acceptReview as acceptReviewService, overrideReview as overrideReviewService } from "./review";
import { rescoreLead } from "./services";

function fail(issues: unknown): AppError {
  return new AppError("VALIDATION_FAILED", "Please check the form and try again.", {
    details: { issues },
  });
}

export async function rescoreLeadAction(leadId: string): Promise<ActionResult<{ status: string }>> {
  try {
    const actor = actorOf(await requireUser());
    const parsed = z.object({ leadId: IdSchema }).safeParse({ leadId });
    if (!parsed.success) return err(fail(parsed.error.issues));
    const result = await rescoreLead(actor, parsed.data.leadId);
    return ok({ status: result.status });
  } catch (error) {
    return err(error);
  }
}

export async function disqualifyLeadAction(
  leadId: string,
  reason: string,
): Promise<ActionResult<{ ok: true }>> {
  try {
    const actor = actorOf(await requireUser());
    const parsed = z
      .object({ leadId: IdSchema, reason: z.string().min(1).max(200) })
      .safeParse({ leadId, reason });
    if (!parsed.success) return err(fail(parsed.error.issues));
    await disqualifyLead(actor, parsed.data.leadId, parsed.data.reason);
    return ok({ ok: true });
  } catch (error) {
    return err(error);
  }
}

export async function assignLeadAction(
  leadId: string,
  ownerId: string,
): Promise<ActionResult<{ ok: true }>> {
  try {
    const actor = actorOf(await requireUser());
    const parsed = z.object({ leadId: IdSchema, ownerId: IdSchema }).safeParse({ leadId, ownerId });
    if (!parsed.success) return err(fail(parsed.error.issues));
    await assignLead(actor, parsed.data.leadId, parsed.data.ownerId);
    return ok({ ok: true });
  } catch (error) {
    return err(error);
  }
}

export async function acceptReviewAction(leadId: string): Promise<ActionResult<{ ok: true }>> {
  try {
    const actor = actorOf(await requireUser());
    const parsed = z.object({ leadId: IdSchema }).safeParse({ leadId });
    if (!parsed.success) return err(fail(parsed.error.issues));
    await acceptReviewService(actor, parsed.data.leadId);
    return ok({ ok: true });
  } catch (error) {
    return err(error);
  }
}

export async function overrideReviewAction(
  leadId: string,
  decision: "QUALIFY" | "DISQUALIFY",
  note: string,
): Promise<ActionResult<{ ok: true }>> {
  try {
    const actor = actorOf(await requireUser());
    const parsed = z
      .object({ leadId: IdSchema, decision: z.enum(["QUALIFY", "DISQUALIFY"]), note: z.string().min(1).max(500) })
      .safeParse({ leadId, decision, note });
    if (!parsed.success) return err(fail(parsed.error.issues));
    await overrideReviewService(actor, parsed.data.leadId, parsed.data.decision, parsed.data.note);
    return ok({ ok: true });
  } catch (error) {
    return err(error);
  }
}

export async function setLeadingLeadAction(
  groupId: string,
  leadId: string,
): Promise<ActionResult<{ ok: true }>> {
  try {
    const actor = actorOf(await requireUser());
    const parsed = z.object({ groupId: IdSchema, leadId: IdSchema }).safeParse({ groupId, leadId });
    if (!parsed.success) return err(fail(parsed.error.issues));
    await setLeadingLeadService(actor, parsed.data.groupId, parsed.data.leadId);
    return ok({ ok: true });
  } catch (error) {
    return err(error);
  }
}

export async function splitGroupAction(groupId: string): Promise<ActionResult<{ ok: true }>> {
  try {
    const actor = actorOf(await requireUser());
    const parsed = z.object({ groupId: IdSchema }).safeParse({ groupId });
    if (!parsed.success) return err(fail(parsed.error.issues));
    await splitGroupService(actor, parsed.data.groupId);
    return ok({ ok: true });
  } catch (error) {
    return err(error);
  }
}
