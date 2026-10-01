import "server-only";

/**
 * Draft creation (module spec §3.11, step 2). Gathers the lead's pitchable findings, pitch angle,
 * portfolio, sequence step and thread history; asks the model for a message; validates it (channel
 * shape, links, banned phrases, citations — INV-5); and stores a Message with its citation rows.
 * Only the leading lead of a cross-sell group is drafted (INV-9); held leads are skipped.
 *
 * The model call (runTask) runs outside the database transaction (external I/O rule); the Message,
 * its citations and any first-touch transition are written in one transaction afterwards.
 */

import type { Actor, Channel, Market, ServiceLine } from "@/contracts/common";
import { AppError } from "@/lib/errors";
import { assertActorCan } from "@/platform/auth";
import { withTransaction, type Tx } from "@/platform/db";
import { publishAfterCommit } from "@/platform/events";
import {
  CITATION_MARKER,
  assertClaimsCited,
  registerTask,
  runTask,
} from "@/platform/ai";
import { transitionLead } from "@/modules/acquisition/core";
import { getActiveProfile, resolvePitchAngle, resolvePortfolio } from "@/modules/acquisition/profiles";

import { getCrossSellContext, getBookingLink, getLeadBrief } from "../_seams";
import { createCitations, createMessage, listThreadMessages } from "../email/email.repo";
import { validateDraftShape } from "./validators";
import { findContactForDraft, findPitchableFindings, loadLeadForDraft } from "./draft.repo";
import { outreachDraftEditTask, outreachDraftTask } from "./tasks";
import type { OutreachDraftInput, OutreachDraftOutput } from "./schemas";
import { OutreachDraftInputSchema } from "./schemas";

const MAX_FINDINGS = 5;
const MAX_PORTFOLIO = 2;

let tasksRegistered = false;
/** Idempotently registers the outreach tasks so they resolve before Phase 19 wires the manifest. */
export function ensureOutreachTasksRegistered(): void {
  if (tasksRegistered) return;
  registerTask(outreachDraftTask);
  registerTask(outreachDraftEditTask);
  tasksRegistered = true;
}

interface ResolvedStep {
  index: number;
  channel: Channel;
  purpose: string;
  pitchAngleId: string | null;
  includeBookingLink: boolean;
  isFirstTouch: boolean;
}

async function resolveStep(
  line: ServiceLine,
  market: Market,
  stepIndex: number,
): Promise<ResolvedStep> {
  const profile = await getActiveProfile(line);
  const sequences = profile.sequences[market];
  const def = sequences.find((s) => s.isDefault) ?? sequences[0];
  const step = def?.steps.find((s) => s.index === stepIndex);
  if (step === undefined) throw new AppError("NOT_FOUND", `No sequence step ${String(stepIndex)} for ${line}/${market}`);
  return {
    index: step.index,
    channel: step.channel,
    purpose: step.purpose,
    pitchAngleId: step.pitchAngleId ?? null,
    includeBookingLink: step.includeBookingLink,
    isFirstTouch: step.index === 0,
  };
}

interface AssembledDraft {
  input: OutreachDraftInput;
  lead: { id: string; serviceLine: ServiceLine; market: Market; companyId: string; ownerId: string | null };
  contactId: string;
  step: ResolvedStep;
  allowedLinks: string[];
}

async function ownerName(tx: Tx | null, ownerId: string | null): Promise<{ name: string; title: string | null }> {
  if (ownerId === null) return { name: "The FUTUREUNI team", title: null };
  const { db } = await import("@/platform/db");
  const user = await (tx ?? db).user.findUnique({ where: { id: ownerId }, select: { name: true } });
  return { name: user?.name ?? "The FUTUREUNI team", title: null };
}

async function assembleDraftInput(
  leadId: string,
  contactId: string | undefined,
  stepIndex: number,
): Promise<AssembledDraft> {
  const lead = await loadLeadForDraft(null, leadId);
  if (lead === null) throw new AppError("NOT_FOUND", "Lead not found.");

  const resolvedContactId = contactId ?? lead.primaryContactId;
  if (resolvedContactId === null) {
    throw new AppError("VALIDATION_FAILED", "The lead has no contact to draft to.");
  }
  const contact = await findContactForDraft(null, resolvedContactId);
  if (contact === null) throw new AppError("NOT_FOUND", "Contact not found.");

  const step = await resolveStep(lead.serviceLine, lead.market, stepIndex);
  const profile = await getActiveProfile(lead.serviceLine);
  const brief = await getLeadBrief(leadId);
  const findings = await findPitchableFindings(null, leadId, MAX_FINDINGS);

  // Pitch angle: the step's angle, else the brief's suggestion, else the best-ranked angle.
  const marketAngles = profile.pitchAngles[lead.market];
  const preferredId = step.pitchAngleId ?? brief.suggestedAngleId;
  const ranked = resolvePitchAngle(profile, lead.market, {
    signals: [],
    findings: findings.map((f) => ({ checkId: f.checkId })),
  });
  const angle =
    marketAngles.find((a) => a.id === preferredId) ??
    ranked[0]?.angle ??
    marketAngles[0];
  if (angle === undefined) throw new AppError("NOT_FOUND", `No pitch angle for ${lead.serviceLine}/${lead.market}`);

  const portfolio = resolvePortfolio(profile, lead.market, angle.proofTags).slice(0, MAX_PORTFOLIO);
  const sender = await ownerName(null, lead.ownerId);
  const bookingLink = step.includeBookingLink ? await getBookingLink(leadId, lead.ownerId ?? undefined) : null;
  const previous = await listThreadMessages(null, leadId);
  const crossSell = await getCrossSellContext(leadId);

  const allowedLinks = [
    ...portfolio.flatMap((p) => (p.url === undefined ? [] : [p.url])),
    ...(bookingLink === null ? [] : [bookingLink]),
  ];

  const input: OutreachDraftInput = OutreachDraftInputSchema.parse({
    company: { name: lead.company.name, country: lead.company.country, city: lead.company.city, industry: null },
    contact: { firstName: contact.firstName, role: contact.role },
    serviceLine: lead.serviceLine,
    market: lead.market,
    findings: findings.map((f) => ({ id: f.id, checkId: f.checkId, severity: f.severity, claim: f.claim, evidence: f.evidence, sourceUrl: f.sourceUrl })),
    pitchAngle: { id: angle.id, hook: angle.hook, proofTags: angle.proofTags },
    portfolio: portfolio.map((p) => ({ id: p.id, title: p.title, description: p.description, outcomeMetric: p.outcomeMetric ?? null, url: p.url ?? null })),
    step: { index: step.index, purpose: step.purpose, channel: step.channel, includeBookingLink: step.includeBookingLink, isFirstTouch: step.isFirstTouch },
    previousMessages: previous.map((m) => ({ stepIndex: m.stepIndex, subject: m.subject, body: m.body })),
    crossSell:
      crossSell.groupId !== null && crossSell.isLeading
        ? { leadingLine: lead.serviceLine, secondaryLines: crossSell.lines.filter((l) => l !== lead.serviceLine) }
        : null,
    sender: { name: sender.name, title: sender.title },
    bookingLink,
  });

  return {
    input,
    lead: { id: lead.id, serviceLine: lead.serviceLine, market: lead.market, companyId: lead.companyId, ownerId: lead.ownerId },
    contactId: resolvedContactId,
    step,
    allowedLinks,
  };
}

/** Replaces mock citation sentinels (`__CITE1__`…) with real finding markers; a no-op for real AI. */
function substituteSentinels(text: string, findingIds: readonly string[]): string {
  return text.replace(/__CITE(\d+)__/g, (_m, n: string) => {
    const id = findingIds[Number.parseInt(n, 10) - 1];
    return id === undefined ? "" : `[[f:${id}]]`;
  });
}

function parseCitations(body: string): { findingIds: string[]; signalIds: string[] } {
  const findingIds = new Set<string>();
  const signalIds = new Set<string>();
  for (const match of body.matchAll(CITATION_MARKER)) {
    const kind = match[1];
    const id = match[2];
    if (id === undefined) continue;
    if (kind === "f") findingIds.add(id);
    else signalIds.add(id);
  }
  return { findingIds: [...findingIds], signalIds: [...signalIds] };
}

interface Reconciled {
  subject: string | null;
  body: string;
  ok: boolean;
  errors: string[];
  findingIds: string[];
  signalIds: string[];
}

function reconcile(output: OutreachDraftOutput, prepared: AssembledDraft): Reconciled {
  const findingIds = prepared.input.findings.map((f) => f.id);
  const body = substituteSentinels(output.body, findingIds);
  const subject = output.subject === null ? null : substituteSentinels(output.subject, findingIds);

  const errors: string[] = [];
  try {
    assertClaimsCited(body, findingIds, { requireAtLeastOne: true });
  } catch (error) {
    errors.push(error instanceof Error ? error.message : "Citation check failed.");
  }
  const shape = validateDraftShape({
    channel: prepared.step.channel,
    isFirstTouch: prepared.step.isFirstTouch,
    subject,
    body,
    allowedLinks: prepared.allowedLinks,
  });
  errors.push(...shape.errors);

  const cited = parseCitations(body);
  return { subject, body, ok: errors.length === 0, errors, findingIds: cited.findingIds, signalIds: cited.signalIds };
}

async function generate(input: OutreachDraftInput, actor: Actor, leadId: string): Promise<{ output: OutreachDraftOutput; callId: string | null }> {
  const result = await runTask<OutreachDraftInput, OutreachDraftOutput>({
    task: "acquisition.outreach-draft",
    input,
    actor,
    context: { leadId, module: "acquisition" },
  });
  return { output: result.output, callId: result.callId };
}

export interface CreateDraftInput {
  leadId: string;
  contactId?: string;
  stepIndex: number;
  /** First-touch drafts transition SCORED → IN_REVIEW; follow-ups do not. Defaults to stepIndex === 0. */
  transition?: boolean;
  /**
   * Trusted system caller (the tick's follow-ups, re-engagement). Skips the `message.draft`
   * permission check, which is a role gate for human-initiated drafting; eligibility is the
   * enrolment/sequence state. The provided actor is still recorded on events and the AiCall.
   */
  system?: boolean;
}

export type CreateDraftResult =
  | { status: "created"; messageId: string; messageStatus: "DRAFT" | "NEEDS_EDIT" }
  | { status: "skipped"; reason: string };

export async function createDraft(actor: Actor, input: CreateDraftInput): Promise<CreateDraftResult> {
  ensureOutreachTasksRegistered();
  const prepared = await assembleDraftInput(input.leadId, input.contactId, input.stepIndex);

  if (input.system !== true) {
    await assertActorCan(actor, "acquisition.message.draft", {
      serviceLine: prepared.lead.serviceLine,
      ownerId: prepared.lead.ownerId ?? undefined,
    });
  }

  // Cross-sell gate: only the leading lead of a group is drafted (INV-9).
  const crossSell = await getCrossSellContext(input.leadId);
  if (!crossSell.isLeading) return { status: "skipped", reason: "cross-sell-held" };

  // Generate with one repair attempt.
  let gen = await generate(prepared.input, actor, input.leadId);
  let reconciled = reconcile(gen.output, prepared);
  if (!reconciled.ok) {
    gen = await generate(prepared.input, actor, input.leadId);
    reconciled = reconcile(gen.output, prepared);
  }
  const messageStatus: "DRAFT" | "NEEDS_EDIT" = reconciled.ok ? "DRAFT" : "NEEDS_EDIT";
  const transition = input.transition ?? input.stepIndex === 0;

  return withTransaction(async (tx) => {
    const message = await createMessage(tx, {
      leadId: prepared.lead.id,
      companyId: prepared.lead.companyId,
      contactId: prepared.contactId,
      stepIndex: input.stepIndex,
      kind: "SEQUENCE",
      channel: prepared.step.channel,
      status: messageStatus,
      subject: reconciled.subject,
      body: reconciled.body,
      angleId: prepared.input.pitchAngle.id,
      portfolioIds: prepared.input.portfolio.map((p) => p.id),
      personalizationNotes: gen.output.personalizationNotes,
      ...(gen.callId === null ? {} : { aiCallId: gen.callId }),
    });
    await createCitations(tx, message.id, reconciled.findingIds, reconciled.signalIds);

    if (transition && prepared.step.isFirstTouch) {
      const { event } = await transitionLead(tx, {
        leadId: prepared.lead.id,
        to: "IN_REVIEW",
        actor,
        reason: "first-touch draft created",
      });
      if (event !== null) {
        await publishAfterCommit(tx, {
          name: "lead.statusChanged",
          actor,
          payload: {
            leadId: prepared.lead.id,
            leadEventId: event.id,
            from: event.fromStatus,
            to: "IN_REVIEW",
            serviceLine: prepared.lead.serviceLine,
            market: prepared.lead.market,
            reason: "first-touch draft created",
          },
        });
      }
    }

    await publishAfterCommit(tx, {
      name: "message.drafted",
      actor,
      payload: { messageId: message.id, leadId: prepared.lead.id, stepIndex: input.stepIndex, status: messageStatus },
    });

    return { status: "created", messageId: message.id, messageStatus };
  });
}
