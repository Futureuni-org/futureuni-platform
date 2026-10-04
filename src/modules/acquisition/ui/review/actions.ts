"use server";

/**
 * Server actions for the review queue. Reads compose score, contactability, cross-sell and audit
 * findings for the focused lead (none of those services self-authorise, so this gate is the
 * control). Mutations wrap the outreach and scoring services, which authorise on the actor.
 */

import { AppError } from "@/lib/errors";
import { ok, err, type ActionResult } from "@/lib/result";
import { actorOf, assertCan, requireUser } from "@/platform/auth";
import {
  approveMessage,
  createCallTask,
  editMessage,
  markAssistedSent,
  prepareLinkedIn,
  prepareWhatsApp,
  regenerateMessage,
  rejectMessage,
  snoozeLead,
} from "@/modules/acquisition/outreach";
import { acceptReview, getLeadScore, overrideReview } from "@/modules/acquisition/scoring";
import { getContactability } from "@/modules/acquisition/compliance";
import { getCrossSellContext } from "@/modules/acquisition/crosssell";
import { getAuditsForLead } from "@/modules/acquisition/audits";
import { resolveLine } from "@/modules/acquisition/ui/shell";

import { getReviewLeadMeta } from "./review-context.repo";
import type {
  BorderlineRecommendationView,
  ChannelVerdictView,
  FindingChipView,
  RejectReason,
  ReviewContext,
} from "./view";

const FINDING_CAP = 30;

export async function getReviewContextAction(
  slug: string,
  leadId: string,
): Promise<ActionResult<ReviewContext>> {
  try {
    const user = await requireUser();
    const ctx = resolveLine(slug);
    if (ctx === null) return err(new AppError("NOT_FOUND", "Unknown service line."));

    const meta = await getReviewLeadMeta(leadId);
    if (meta === null) return err(new AppError("NOT_FOUND", "That lead isn't in this line."));
    if (meta.serviceLine !== ctx.line) {
      return err(new AppError("NOT_FOUND", "That lead isn't in this line."));
    }
    assertCan(user, "acquisition.review.read", {
      serviceLine: ctx.line,
      ...(meta.ownerId === null ? {} : { ownerId: meta.ownerId }),
    });

    const [scoreView, contactability, crossSell, audits] = await Promise.all([
      getLeadScore(leadId),
      getContactability(null, {
        companyId: meta.companyId,
        ...(meta.primaryContactId === null ? {} : { contactId: meta.primaryContactId }),
      }),
      getCrossSellContext(leadId),
      getAuditsForLead(actorOf(user), leadId).catch(() => []),
    ]);

    const review = scoreView?.review ?? null;
    const recommendation: BorderlineRecommendationView | null =
      review !== null && review.humanDecision === null && (scoreView?.needsHumanReview ?? false)
        ? { recommendation: review.recommendation, confidence: review.confidence }
        : null;

    const verdicts: ChannelVerdictView[] = [
      { channel: "email", status: contactability.email.status, reason: contactability.email.reason },
      { channel: "whatsapp", status: contactability.whatsapp.status, reason: contactability.whatsapp.reason },
      { channel: "linkedin", status: contactability.linkedin.status, reason: contactability.linkedin.reason },
      { channel: "phone", status: contactability.phone.status, reason: contactability.phone.reason },
    ];
    const complianceReason =
      contactability.email.status === "REVIEW" || contactability.email.status === "CONSENT_REQUIRED"
        ? contactability.email.reason
        : null;

    const findings: FindingChipView[] = audits
      .flatMap((audit) => audit.findings)
      .slice(0, FINDING_CAP)
      .map((finding) => ({
        id: finding.id,
        severity: finding.severity,
        method: finding.method,
        claim: finding.claim,
        sourceUrl: finding.sourceUrl,
        artifactUrl: finding.artifactUrl,
        capturedAt: finding.capturedAt.toISOString(),
        pitchable: finding.pitchable,
        dismissed: finding.dismissedAt !== null,
      }));

    return ok({
      leadId,
      score: scoreView?.score ?? null,
      band: scoreView?.band ?? null,
      reasons: scoreView?.reasons ?? [],
      needsHumanReview: scoreView?.needsHumanReview ?? false,
      recommendation,
      verdicts,
      complianceReason,
      crossSell:
        crossSell.groupId === null
          ? null
          : { isLeading: crossSell.isLeading, otherLines: crossSell.lines.filter((l) => l !== ctx.line) },
      findings,
      whatsappConfidence: meta.whatsappConfidence,
      companyWebsite: meta.companyWebsite,
      linkedinUrl: meta.linkedinUrl,
    });
  } catch (error) {
    return err(error);
  }
}

// --- mutations (services authorise on the actor) ------------------------------------------------

export async function approveAction(
  slug: string,
  messageId: string,
  humanConfirmedClaims: boolean,
): Promise<ActionResult<{ scheduledFor: string | null }>> {
  try {
    const user = await requireUser();
    const result = await approveMessage(actorOf(user), messageId, { humanConfirmedClaims });
    return ok({ scheduledFor: result.scheduledFor?.toISOString() ?? null });
  } catch (error) {
    return err(error);
  }
}

export async function editAction(
  slug: string,
  messageId: string,
  subject: string | null,
  body: string,
): Promise<ActionResult<null>> {
  try {
    const user = await requireUser();
    await editMessage(actorOf(user), messageId, { subject, body });
    return ok(null);
  } catch (error) {
    return err(error);
  }
}

export async function rejectAction(
  slug: string,
  messageId: string,
  input: { reason: RejectReason; note?: string; disqualify: boolean },
): Promise<ActionResult<null>> {
  try {
    const user = await requireUser();
    await rejectMessage(actorOf(user), messageId, {
      reason: input.reason,
      ...(input.note === undefined || input.note.length === 0 ? {} : { note: input.note }),
      disqualifyLead: input.disqualify,
    });
    return ok(null);
  } catch (error) {
    return err(error);
  }
}

export async function regenerateAction(
  slug: string,
  messageId: string,
  instruction: string,
): Promise<ActionResult<{ messageId: string }>> {
  try {
    const user = await requireUser();
    const result = await regenerateMessage(actorOf(user), messageId, {
      ...(instruction.trim().length === 0 ? {} : { instruction: instruction.trim() }),
    });
    return ok(result);
  } catch (error) {
    return err(error);
  }
}

export async function snoozeAction(
  slug: string,
  leadId: string,
  untilIso: string,
): Promise<ActionResult<null>> {
  try {
    const user = await requireUser();
    await snoozeLead(actorOf(user), leadId, new Date(untilIso));
    return ok(null);
  } catch (error) {
    return err(error);
  }
}

export async function prepareWhatsAppAction(
  slug: string,
  messageId: string,
): Promise<ActionResult<{ url: string; text: string }>> {
  try {
    const user = await requireUser();
    const result = await prepareWhatsApp(actorOf(user), messageId);
    return ok({ url: result.url, text: result.text });
  } catch (error) {
    return err(error);
  }
}

export async function prepareLinkedInAction(
  slug: string,
  messageId: string,
): Promise<ActionResult<{ text: string; companyPageUrl: string }>> {
  try {
    const user = await requireUser();
    const result = await prepareLinkedIn(actorOf(user), messageId);
    return ok({ text: result.text, companyPageUrl: result.companyPageUrl });
  } catch (error) {
    return err(error);
  }
}

export async function createCallTaskAction(
  slug: string,
  messageId: string,
): Promise<ActionResult<{ phone: string; talkingPoints: string[] }>> {
  try {
    const user = await requireUser();
    const result = await createCallTask(actorOf(user), messageId);
    return ok({ phone: result.phone, talkingPoints: result.talkingPoints });
  } catch (error) {
    return err(error);
  }
}

export async function markAssistedSentAction(
  slug: string,
  messageId: string,
  input: { note?: string; callOutcome?: "CONNECTED" | "NO_ANSWER" | "VOICEMAIL" | "WRONG_NUMBER" | "CALLBACK_REQUESTED" },
): Promise<ActionResult<null>> {
  try {
    const user = await requireUser();
    await markAssistedSent(actorOf(user), messageId, {
      sentAt: new Date(),
      ...(input.note === undefined || input.note.length === 0 ? {} : { note: input.note }),
      ...(input.callOutcome === undefined ? {} : { callOutcome: input.callOutcome }),
    });
    return ok(null);
  } catch (error) {
    return err(error);
  }
}

export async function acceptReviewAction(slug: string, leadId: string): Promise<ActionResult<null>> {
  try {
    const user = await requireUser();
    await acceptReview(actorOf(user), leadId);
    return ok(null);
  } catch (error) {
    return err(error);
  }
}

export async function overrideReviewAction(
  slug: string,
  leadId: string,
  decision: "QUALIFY" | "DISQUALIFY",
  note: string,
): Promise<ActionResult<null>> {
  try {
    const user = await requireUser();
    await overrideReview(actorOf(user), leadId, decision, note);
    return ok(null);
  } catch (error) {
    return err(error);
  }
}
