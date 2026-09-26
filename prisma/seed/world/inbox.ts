/**
 * Replies, a correction, inbox threads and the answers drafted or sent to replies (data-model
 * §10.7): 16 replies covering every ReplyClass, one unmatched email and one WhatsApp reply a
 * person pasted in. SLA states cover ON_TRACK, WARNING, BREACHED and MET.
 */

import type { ReplyClass } from "@/contracts/common";
import {
  ReplyActionsTakenSchema,
  ReplyReferralSchema,
  type ReplyActionsTaken,
} from "@/contracts/acquisition-records";
import { toJsonInput, type Prisma } from "@/platform/db";

import { KEY_LEADS } from "../data/leads";
import { seedId } from "../lib/ids";
import { ago, dayOf, fromNow } from "../lib/time";

import {
  byLead,
  contactIdsByCompany,
  lastTime,
  timeOf,
  userId,
  type LeadInfo,
  type Row,
} from "./base";
import { AI_CALL } from "./leads";
import { mailboxId, type Evidence, type OutreachWorld } from "./outreach";

export interface InboxWorld {
  replies: Row<Prisma.ReplyUncheckedCreateInput>[];
  replyCorrections: Row<Prisma.ReplyCorrectionUncheckedCreateInput>[];
  inboxThreads: Row<Prisma.InboxThreadUncheckedCreateInput>[];
  /** Messages answering replies (written after the replies they point at). */
  answers: Row<Prisma.MessageUncheckedCreateInput>[];
  answerCitations: Row<Prisma.MessageCitationUncheckedCreateInput>[];
  answerTracking: Row<Prisma.TrackingEventUncheckedCreateInput>[];
}

type Sla = "NONE" | "ON_TRACK" | "WARNING" | "BREACHED" | "MET";

interface ReplyPlan {
  lead: number | null;
  classification: ReplyClass | null;
  channel?: "EMAIL" | "WHATSAPP";
  /** When it arrived (default: when the lead's REPLIED status was first reached). */
  at?: (lead: LeadInfo | null, now: Date) => Date;
  sla: Sla;
  text: string;
  summary: string;
  sentiment: "positive" | "neutral" | "negative";
  read: boolean;
  confidence?: number;
  objection?: string;
  questions?: string[];
  followUpInDays?: number;
  needsHumanReview?: boolean;
  actions: ReplyActionsTaken[number]["action"][];
  /** An answer to this reply: drafted, or sent (the SLA was met). */
  answer?: "DRAFT" | "SENT";
}

const repliedAt = (lead: LeadInfo | null, now: Date): Date =>
  lead === null ? now : (timeOf(lead, "REPLIED") ?? lastTime(lead));

const PLANS: readonly ReplyPlan[] = [
  {
    lead: 13,
    classification: "INTERESTED",
    at: (lead, now) => (lead === null ? now : lastTime(lead)),
    sla: "ON_TRACK",
    text: "Sorry we had to cancel. Could we do Thursday instead? Still keen to see what you'd change on the site.",
    summary: "Wants to rebook for Thursday; still interested",
    sentiment: "positive",
    read: false,
    confidence: 0.93,
    actions: ["STATUS_CHANGED", "OWNER_NOTIFIED", "SLA_STARTED"],
    answer: "DRAFT",
  },
  {
    lead: 31,
    classification: "QUESTION",
    at: (lead, now) => (lead === null ? now : lastTime(lead)),
    sla: "WARNING",
    text: "Does this cover the booking app as well, or only the website?",
    summary: "Asks whether the booking app is in scope",
    sentiment: "neutral",
    read: false,
    confidence: 0.64,
    questions: ["Does the work cover the booking app?"],
    actions: ["SEQUENCE_STOPPED", "STATUS_CHANGED", "SLA_STARTED", "RECLASSIFIED"],
    answer: "DRAFT",
  },
  {
    lead: 49,
    classification: "OBJECTION_PRICE",
    at: (lead, now) => (lead === null ? now : lastTime(lead)),
    sla: "BREACHED",
    text: "Looks good but honestly it's more than we'd planned to spend this year.",
    summary: "Likes it; says the price is above their budget",
    sentiment: "neutral",
    read: false,
    confidence: 0.88,
    objection: "Price above this year's budget",
    actions: ["SEQUENCE_STOPPED", "STATUS_CHANGED", "SLA_STARTED"],
  },
  {
    lead: 69,
    classification: "OBJECTION_OTHER",
    sla: "MET",
    text: "We already work with a freelance editor, thanks.",
    summary: "Already has a freelance editor",
    sentiment: "neutral",
    read: true,
    confidence: 0.86,
    objection: "Already works with a freelancer",
    actions: ["SEQUENCE_STOPPED", "STATUS_CHANGED", "SLA_STARTED"],
  },
  {
    lead: 18,
    classification: "NOT_NOW",
    sla: "MET",
    text: "Not right now. We're opening the new branch first; try us again in a couple of months.",
    summary: "Not now: check back after the new branch opens",
    sentiment: "positive",
    read: true,
    confidence: 0.91,
    followUpInDays: 60,
    actions: ["SEQUENCE_STOPPED", "NURTURED"],
  },
  {
    lead: 30,
    classification: "WRONG_PERSON",
    at: (_lead, now) => ago(now, { days: 2 }),
    sla: "NONE",
    text: "I'm on the engineering side. Alicia Moreno runs product, she's the one to talk to: alicia@brightloop.example",
    summary: "Wrong person; refers us to the head of product",
    sentiment: "positive",
    read: false,
    confidence: 0.9,
    actions: ["SEQUENCE_STOPPED", "REFERRAL_PROPOSED", "DRAFT_CREATED"],
    answer: "DRAFT",
  },
  {
    lead: KEY_LEADS.whatsappUnsubscribe,
    classification: "UNSUBSCRIBE",
    channel: "WHATSAPP",
    at: (lead, now) => (lead === null ? now : new Date(lastTime(lead).getTime() - 3_600_000)),
    sla: "NONE",
    text: "Please stop messaging this number.",
    summary: "Asked on WhatsApp not to be contacted again",
    sentiment: "negative",
    read: true,
    actions: ["SUPPRESSED", "SEQUENCE_STOPPED", "STATUS_CHANGED"],
  },
  {
    lead: KEY_LEADS.outOfOffice,
    classification: "OUT_OF_OFFICE",
    at: (_lead, now) => ago(now, { days: 2 }),
    sla: "NONE",
    text: "I'm out of the office until next week with limited access to email.",
    summary: "Out of office until next week",
    sentiment: "neutral",
    read: true,
    followUpInDays: 5,
    actions: ["SEQUENCE_PAUSED"],
  },
  {
    lead: KEY_LEADS.hardBounce,
    classification: "BOUNCE",
    at: (lead, now) =>
      lead === null ? now : new Date((timeOf(lead, "CONTACTED") ?? now).getTime() + 120_000),
    sla: "NONE",
    text: "Delivery Status Notification (Failure): 550 5.1.1 The email account that you tried to reach does not exist.",
    summary: "Hard bounce: the address doesn't exist",
    sentiment: "neutral",
    read: true,
    actions: ["BOUNCE_RECORDED", "SUPPRESSED", "SEQUENCE_STOPPED", "STATUS_CHANGED"],
  },
  {
    lead: 68,
    classification: "OTHER",
    at: (_lead, now) => ago(now, { days: 1 }),
    sla: "NONE",
    text: "Thanks, forwarding this on.",
    summary: "Forwarded internally; unclear next step",
    sentiment: "neutral",
    read: false,
    confidence: 0.41,
    needsHumanReview: true,
    actions: ["SEQUENCE_STOPPED", "OWNER_NOTIFIED"],
  },
  {
    lead: 70,
    classification: "INTERESTED",
    sla: "MET",
    text: "Yes please, send me the details and prices. Happy to have a call.",
    summary: "Interested; asks for details and prices",
    sentiment: "positive",
    read: true,
    confidence: 0.95,
    actions: ["SEQUENCE_STOPPED", "STATUS_CHANGED", "OWNER_NOTIFIED", "SLA_STARTED"],
    answer: "SENT",
  },
  {
    lead: 14,
    classification: "INTERESTED",
    sla: "MET",
    text: "This is useful. Can we talk this week?",
    summary: "Interested; wants a call this week",
    sentiment: "positive",
    read: true,
    confidence: 0.94,
    actions: ["SEQUENCE_STOPPED", "STATUS_CHANGED", "OWNER_NOTIFIED", "SLA_STARTED"],
    answer: "SENT",
  },
  {
    lead: null,
    classification: null,
    at: (_lead, now) => ago(now, { hours: 5 }),
    sla: "NONE",
    text: "Hi, is this still the right address for design enquiries?",
    summary: "Unmatched: asks about design enquiries",
    sentiment: "neutral",
    read: false,
    actions: [],
  },
  {
    lead: 51,
    classification: "QUESTION",
    sla: "MET",
    text: "Does the price include the print-ready files for signage?",
    summary: "Asks whether print files are included",
    sentiment: "neutral",
    read: true,
    confidence: 0.89,
    questions: ["Are print-ready files included?"],
    actions: ["SEQUENCE_STOPPED", "STATUS_CHANGED", "SLA_STARTED"],
  },
  {
    lead: 73,
    classification: "NOT_NOW",
    sla: "MET",
    text: "Timing isn't right for us this quarter. Maybe in the new year.",
    summary: "Not this quarter",
    sentiment: "neutral",
    read: true,
    confidence: 0.87,
    followUpInDays: 21,
    actions: ["SEQUENCE_STOPPED", "STATUS_CHANGED"],
  },
  {
    lead: 17,
    classification: "OBJECTION_PRICE",
    sla: "MET",
    text: "We were hoping for something closer to $3,000.",
    summary: "Budget closer to $3,000",
    sentiment: "neutral",
    read: true,
    confidence: 0.9,
    objection: "Budget around $3,000",
    actions: ["SEQUENCE_STOPPED", "STATUS_CHANGED", "SLA_STARTED"],
  },
];

const SLA_HOURS = 4;

export function buildInbox(
  now: Date,
  leads: readonly LeadInfo[],
  outreach: OutreachWorld,
  evidence: Evidence,
): InboxWorld {
  const world: InboxWorld = {
    replies: [],
    replyCorrections: [],
    inboxThreads: [],
    answers: [],
    answerCitations: [],
    answerTracking: [],
  };
  const contactIds = contactIdsByCompany();
  const repliesByLead = new Map<number, { receivedAt: Date; read: boolean }[]>();

  PLANS.forEach((plan, index) => {
    const n = index + 1;
    const id = seedId("rply", n);
    const lead = plan.lead === null ? null : byLead(leads, plan.lead);
    const receivedAt = (plan.at ?? repliedAt)(lead, now);
    const email = lead === null ? undefined : outreach.lastEmailByLead.get(lead.n);
    const contact =
      lead?.contactIndex == null ? undefined : lead.company.contacts[lead.contactIndex];
    const channel = plan.channel ?? "EMAIL";
    const matched = lead !== null;
    const matchMethod = !matched
      ? "UNMATCHED"
      : channel === "WHATSAPP"
        ? "MANUAL"
        : email === undefined
          ? "SENDER_CONTACT"
          : "IN_REPLY_TO";
    const slaDueAt =
      plan.sla === "NONE" ? null : new Date(receivedAt.getTime() + SLA_HOURS * 3_600_000);
    const actionsTaken = ReplyActionsTakenSchema.parse(
      plan.actions.map((action, step) => ({
        action,
        at: new Date(receivedAt.getTime() + (step + 1) * 30_000).toISOString(),
      })),
    );
    const referral =
      plan.classification === "WRONG_PERSON" && lead !== null
        ? ReplyReferralSchema.parse({
            name: "Alicia Moreno",
            email: "alicia@brightloop.example",
            role: "Head of product",
            contactId: contactIds.get(lead.company.n)?.[1],
            verification: "UNVERIFIED",
          })
        : null;
    world.replies.push({
      id,
      mailboxId: channel === "EMAIL" ? (email?.mailboxId ?? mailboxId(1)) : null,
      leadId: lead?.id ?? null,
      contactId: lead?.contactId ?? null,
      companyId: lead?.companyId ?? null,
      messageId: email?.id ?? null,
      channel,
      providerMessageId: channel === "EMAIL" ? `seed-reply-${String(n)}` : null,
      providerThreadId: email?.threadId ?? null,
      rfcMessageId:
        channel === "EMAIL"
          ? `<seed-reply-${String(n)}@${lead?.company.domain ?? "unknown-sender.example"}>`
          : null,
      inReplyTo: email?.rfcMessageId ?? null,
      references: email === undefined ? [] : [email.rfcMessageId],
      fromAddress:
        channel === "WHATSAPP"
          ? null
          : plan.classification === "BOUNCE"
            ? "mailer-daemon@googlemail.example"
            : (contact?.email ?? (matched ? null : "enquiries@unknown-sender.example")),
      toAddress:
        channel === "EMAIL"
          ? (outreach.mailboxes.find((box) => box.id === (email?.mailboxId ?? mailboxId(1)))
              ?.address ?? null)
          : null,
      subject:
        channel === "EMAIL"
          ? plan.classification === "BOUNCE"
            ? "Delivery Status Notification (Failure)"
            : `Re: A quick idea for ${lead?.company.name ?? "you"}`.slice(0, 200)
          : null,
      receivedAt,
      ...(plan.classification === "OUT_OF_OFFICE"
        ? { headers: { "auto-submitted": "auto-replied" } }
        : {}),
      rawBodySanitized: plan.text,
      latestText: plan.text,
      matchMethod,
      classification: plan.classification,
      classificationSource:
        plan.classification === null
          ? null
          : plan.classification === "BOUNCE" || plan.classification === "OUT_OF_OFFICE"
            ? "RULE"
            : channel === "WHATSAPP" || n === 2
              ? "HUMAN"
              : "AI",
      confidence: plan.confidence ?? null,
      followUpDate: plan.followUpInDays === undefined ? null : dayOf(now, -plan.followUpInDays),
      ...(referral === null ? {} : { referral: toJsonInput(referral) }),
      objectionSummary: plan.objection ?? null,
      questions: plan.questions ?? [],
      sentiment: plan.sentiment,
      language: "en",
      summary: plan.summary,
      needsHumanReview: plan.needsHumanReview === true,
      readAt: plan.read ? new Date(receivedAt.getTime() + 15 * 60_000) : null,
      slaStatus: plan.sla,
      slaDueAt,
      slaWarnedAt:
        plan.sla === "WARNING" || plan.sla === "BREACHED"
          ? new Date((slaDueAt ?? now).getTime() - 30 * 60_000)
          : null,
      slaBreachedAt: plan.sla === "BREACHED" ? slaDueAt : null,
      firstResponseAt: plan.sla === "MET" ? new Date(receivedAt.getTime() + 2 * 3_600_000) : null,
      processedAt: matched ? new Date(receivedAt.getTime() + 60_000) : null,
      ...(actionsTaken.length === 0 ? {} : { actionsTaken: toJsonInput(actionsTaken) }),
      loggedById: channel === "WHATSAPP" && lead !== null ? lead.ownerId : null,
      aiCallId: n === 2 ? AI_CALL.replyClassification : null,
      createdAt: receivedAt,
    });
    if (lead !== null) {
      repliesByLead.set(lead.n, [
        ...(repliesByLead.get(lead.n) ?? []),
        { receivedAt, read: plan.read },
      ]);
    }

    // The answer: a draft waiting for review, or the reply that met the SLA.
    if (plan.answer !== undefined && lead !== null) {
      const referralContact =
        plan.classification === "WRONG_PERSON" ? contactIds.get(lead.company.n)?.[1] : undefined;
      const answerN = 500 + world.answers.length + 1;
      const answerId = seedId("mesg", answerN);
      const findingId = evidence.findings.get(lead.n)?.[0];
      const cited =
        findingId === undefined
          ? ""
          : ` ${evidence.claims.get(findingId) ?? ""} [[f:${findingId}]]`;
      const sent = plan.answer === "SENT";
      const sentAt = new Date(receivedAt.getTime() + 2 * 3_600_000);
      const salutation = referralContact === undefined ? (contact?.first ?? "there") : "Alicia";
      world.answers.push({
        id: answerId,
        leadId: lead.id,
        companyId: lead.companyId,
        contactId: referralContact ?? lead.contactId,
        kind: "ONE_OFF",
        channel: "EMAIL",
        status: sent ? "SENT" : "DRAFT",
        subject:
          referralContact === undefined
            ? `Re: A quick idea for ${lead.company.name}`.slice(0, 60)
            : "Kevin suggested I get in touch",
        body:
          referralContact === undefined
            ? `Hi ${salutation},\n\nThanks for getting back to me.${cited}\n\nHow does Thursday at 10:00 look?\n\nBest`
            : `Hi Alicia,\n\nKevin suggested you're the right person to talk to about the app.${cited}\n\nWould a short call be useful?\n\nBest`,
        inReplyToReplyId: referralContact === undefined ? id : null,
        humanConfirmedClaims: sent,
        ...(sent
          ? {
              humanConfirmedById: lead.ownerId,
              humanConfirmedAt: sentAt,
              sentAt,
              sentById: lead.ownerId,
              mailboxId: email?.mailboxId ?? mailboxId(1),
              providerMessageId: `mock-answer-${String(answerN)}`,
              providerThreadId: email?.threadId ?? null,
              rfcMessageId: `<seed-answer-${String(answerN)}@getfutureuni.example>`,
              unsubscribeTokenId: seedId("utok", answerN),
              footerSnapshot: `--\nFUTUREUNI\nNot interested? Reply "stop" or unsubscribe: http://localhost:3000/u/${seedId("utok", answerN)}\n[DEV PLACEHOLDER] FUTUREUNI, 1 Example Street, Lagos, Nigeria`,
            }
          : {}),
        createdAt: new Date(receivedAt.getTime() + 60_000),
      });
      if (findingId !== undefined) {
        world.answerCitations.push({
          id: seedId("mcit", 500 + world.answerCitations.length + 1),
          messageId: answerId,
          findingId,
        });
      }
      if (sent) {
        world.answerTracking.push({
          id: seedId("trev", 500 + world.answerTracking.length + 1),
          messageId: answerId,
          mailboxId: email?.mailboxId ?? mailboxId(1),
          type: "DELIVERED",
          provider: "mock",
          providerEventId: `seed-evt-answer-${String(answerN)}`,
          occurredAt: new Date(sentAt.getTime() + 60_000),
        });
      }
    }
  });

  // The correction: the classifier called the question an objection; a person fixed it.
  world.replyCorrections.push({
    id: seedId("rcor", 1),
    replyId: seedId("rply", 2),
    fromClass: "OBJECTION_OTHER",
    toClass: "QUESTION",
    note: "They're asking about scope, not objecting.",
    actorId: userId("uiuxLead"),
    createdAt: ago(now, { hours: 2 }),
  });

  // One thread per lead with replies, assigned to the owner.
  let threadN = 0;
  for (const [leadN, replies] of repliesByLead) {
    const lead = byLead(leads, leadN);
    const lastInbound = replies.reduce(
      (latest, reply) => (reply.receivedAt > latest ? reply.receivedAt : latest),
      new Date(0),
    );
    const outbound = outreach.lastEmailByLead.get(leadN)?.sentAt ?? null;
    threadN += 1;
    world.inboxThreads.push({
      id: seedId("ithr", threadN),
      leadId: lead.id,
      assigneeId: lead.ownerId,
      snoozedUntil: leadN === KEY_LEADS.outOfOffice ? fromNow(now, { days: 5 }) : null,
      lastInboundAt: lastInbound,
      lastOutboundAt: outbound,
      unreadCount: replies.filter((reply) => !reply.read).length,
      createdAt: lastInbound,
    });
  }
  return world;
}
