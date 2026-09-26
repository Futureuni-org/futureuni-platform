/**
 * Sending domains, mailboxes and their stats, enrolments, messages with citations, and delivery
 * events (data-model §10.7). Email is the only automatic channel; WhatsApp and LinkedIn touches are
 * prepared for a person to send (INV-7). Every message cites a finding or a signal (INV-5), and
 * every sent email carries the system footer with the dev postal address (INV-4).
 */

import type { Channel, MessageStatus } from "@/contracts/common";
import { AssistedOutcomeSchema } from "@/contracts/outreach-channel";
import { toJsonInput, type Prisma } from "@/platform/db";

import { KEY_LEADS } from "../data/leads";
import { SEED_USERS } from "../data/users";
import { seedId } from "../lib/ids";
import { ago, dayOf, fromNow } from "../lib/time";

import { approverId, passed, timeOf, userId, type LeadInfo, type Row } from "./base";
import { AI_CALL } from "./leads";
import { angleIdFor, defaultSequence, sequenceId } from "./profiles";

export const DEV_POSTAL_ADDRESS = "[DEV PLACEHOLDER] FUTUREUNI, 1 Example Street, Lagos, Nigeria";

export interface OutreachWorld {
  sendingDomains: Row<Prisma.SendingDomainUncheckedCreateInput>[];
  mailboxes: Row<Prisma.MailboxUncheckedCreateInput>[];
  mailboxDailyStats: Row<Prisma.MailboxDailyStatUncheckedCreateInput>[];
  mailboxSyncStates: Row<Prisma.MailboxSyncStateUncheckedCreateInput>[];
  enrollments: Row<Prisma.EnrollmentUncheckedCreateInput>[];
  messages: Row<Prisma.MessageUncheckedCreateInput>[];
  citations: Row<Prisma.MessageCitationUncheckedCreateInput>[];
  trackingEvents: Row<Prisma.TrackingEventUncheckedCreateInput>[];
  /** The last email sent to each lead, which replies thread onto. */
  lastEmailByLead: ReadonlyMap<
    number,
    { id: string; mailboxId: string; threadId: string; rfcMessageId: string; sentAt: Date }
  >;
}

export interface Evidence {
  /** Citable findings per lead number (pitchable first). */
  findings: ReadonlyMap<number, readonly string[]>;
  claims: ReadonlyMap<string, string>;
  /** A lead's primary signal, when it has a source URL (only those can be cited). */
  signals: ReadonlyMap<number, string>;
}

export const mailboxId = (n: number): string => seedId("mbox", n);

const MAILBOXES = [
  {
    n: 1,
    address: "tunde@getfutureuni.example",
    displayName: "Tunde at FUTUREUNI",
    sender: "manager",
    domain: 1,
    status: "ACTIVE",
    warmupDay: 40,
    health: 0.96,
  },
  {
    n: 2,
    address: "chinedu@getfutureuni.example",
    displayName: "Chinedu at FUTUREUNI",
    sender: "webLead",
    domain: 1,
    status: "WARMING",
    warmupDay: 10,
    health: 0.92,
  },
  {
    n: 3,
    address: "amaka@futureunistudio.example",
    displayName: "Amaka at FUTUREUNI Studio",
    sender: "uiuxLead",
    domain: 2,
    status: "WARMING",
    warmupDay: 3,
    health: 0.88,
  },
  {
    n: 4,
    address: "studio@futureunistudio.example",
    displayName: "FUTUREUNI Studio",
    sender: null,
    domain: 2,
    status: "PAUSED",
    warmupDay: 30,
    health: 0.41,
  },
] as const;

/** Today's cap on the warm-up ramp: startCap → target over rampDays calendar days (INV-8). */
export function rampCap(day: number, startCap = 5, target = 35, rampDays = 24): number {
  if (day >= rampDays) return target;
  return Math.floor(startCap + ((target - startCap) * day) / rampDays);
}

interface EnrollmentPlan {
  status: "ACTIVE" | "PAUSED" | "STOPPED" | "COMPLETED";
  stoppedReason?:
    "REPLY" | "UNSUBSCRIBE" | "BOUNCE" | "MEETING_BOOKED" | "WON" | "LOST" | "SUPPRESSED";
  /** Steps already sent. */
  sent: number;
}

const SPECIAL_ENROLLMENTS: Readonly<Record<number, EnrollmentPlan>> = {
  11: { status: "ACTIVE", sent: 2 },
  12: { status: "PAUSED", sent: 2 },
  20: { status: "STOPPED", stoppedReason: "SUPPRESSED", sent: 1 },
  30: { status: "STOPPED", stoppedReason: "REPLY", sent: 1 },
  32: { status: "STOPPED", stoppedReason: "MEETING_BOOKED", sent: 2 },
  34: { status: "STOPPED", stoppedReason: "WON", sent: 2 },
  35: { status: "STOPPED", stoppedReason: "LOST", sent: 2 },
  38: { status: "STOPPED", stoppedReason: "UNSUBSCRIBE", sent: 1 },
  48: { status: "ACTIVE", sent: 1 },
  52: { status: "STOPPED", stoppedReason: "MEETING_BOOKED", sent: 1 },
  53: { status: "COMPLETED", sent: 4 },
  67: { status: "ACTIVE", sent: 2 },
  68: { status: "STOPPED", stoppedReason: "REPLY", sent: 1 },
  72: { status: "STOPPED", stoppedReason: "MEETING_BOOKED", sent: 2 },
  74: { status: "STOPPED", stoppedReason: "LOST", sent: 2 },
  76: { status: "STOPPED", stoppedReason: "BOUNCE", sent: 1 },
};

function enrollmentPlan(lead: LeadInfo): EnrollmentPlan | null {
  const special = SPECIAL_ENROLLMENTS[lead.n];
  if (special !== undefined) return special;
  if (lead.status === "APPROVED") return { status: "ACTIVE", sent: 0 };
  if (!passed(lead, "CONTACTED")) return null;
  return { status: "STOPPED", stoppedReason: "REPLY", sent: 1 + (lead.n % 2) };
}

function firstName(lead: LeadInfo): string {
  const contact = lead.contactIndex === null ? undefined : lead.company.contacts[lead.contactIndex];
  return contact?.first ?? "there";
}

function ownerFirstName(lead: LeadInfo): string {
  const owner = SEED_USERS.find((user) => userId(user.key) === lead.ownerId);
  return owner?.name.split(" ")[0] ?? "The FUTUREUNI team";
}

function footer(lead: LeadInfo, tokenId: string): string {
  const owner = SEED_USERS.find((user) => userId(user.key) === lead.ownerId);
  return [
    "--",
    `${owner?.name ?? "The team"}, FUTUREUNI`,
    `Not interested? Reply "stop" or unsubscribe: http://localhost:3000/u/${tokenId}`,
    DEV_POSTAL_ADDRESS,
  ].join("\n");
}

export function buildOutreach(
  now: Date,
  leads: readonly LeadInfo[],
  evidence: Evidence,
): OutreachWorld {
  const world: Omit<OutreachWorld, "lastEmailByLead"> = {
    sendingDomains: [
      {
        id: seedId("sdom", 1),
        domain: "getfutureuni.example",
        provider: "mock",
        spfStatus: "PASS",
        dkimStatus: "PASS",
        dmarcStatus: "PASS",
        mxStatus: "PASS",
        dnsDetails: {
          spf: "v=spf1 include:_spf.google.com ~all",
          dmarc: "v=DMARC1; p=none; rua=mailto:dmarc@getfutureuni.example",
        },
        lastCheckedAt: ago(now, { hours: 6 }),
        createdAt: ago(now, { days: 60 }),
      },
      {
        id: seedId("sdom", 2),
        domain: "futureunistudio.example",
        provider: "mock",
        spfStatus: "PASS",
        dkimStatus: "PASS",
        dmarcStatus: "FAIL",
        mxStatus: "PASS",
        dnsDetails: {
          dmarc: {
            found: null,
            expected: "v=DMARC1; p=none; rua=mailto:dmarc@futureunistudio.example",
            fix: "Add a TXT record named _dmarc.futureunistudio.example with the expected value, then re-check.",
          },
        },
        lastCheckedAt: ago(now, { hours: 6 }),
        createdAt: ago(now, { days: 35 }),
      },
    ],
    mailboxes: [],
    mailboxDailyStats: [],
    mailboxSyncStates: [],
    enrollments: [],
    messages: [],
    citations: [],
    trackingEvents: [],
  };

  for (const box of MAILBOXES) {
    const id = mailboxId(box.n);
    const warmupStartDate = dayOf(now, box.warmupDay);
    world.mailboxes.push({
      id,
      address: box.address,
      displayName: box.displayName,
      senderUserId: box.sender === null ? null : userId(box.sender),
      sendingDomainId: seedId("sdom", box.domain),
      provider: "mock",
      credentialProvider: `outreach-mailbox:${id}`,
      status: box.status,
      pausedReason: box.status === "PAUSED" ? "bounce-rate" : null,
      warmupStartDate,
      healthScore: box.health,
      lastHealthCheckAt: ago(now, { hours: 2 }),
      createdAt: warmupStartDate,
    });
    world.mailboxSyncStates.push({
      id: seedId("msyn", box.n),
      mailboxId: id,
      cursor: `seed-history-${String(1_000 + box.n * 17)}`,
      lastPolledAt: ago(now, { minutes: 5 }),
      createdAt: warmupStartDate,
    });
    // The last 14 days, from the day warm-up started.
    for (let back = 13; back >= 0; back -= 1) {
      const day = box.warmupDay - back;
      if (day < 0) continue;
      const paused = box.status === "PAUSED" && back < 3;
      const sent = paused ? 0 : Math.round(rampCap(day) * (box.status === "ACTIVE" ? 0.7 : 0.8));
      world.mailboxDailyStats.push({
        id: seedId("mdst", world.mailboxDailyStats.length + 1),
        mailboxId: id,
        day: dayOf(now, back),
        sent,
        bouncesHard: box.status === "PAUSED" && back >= 3 && back <= 5 ? 2 : 0,
        bouncesSoft: sent > 10 && back % 5 === 0 ? 1 : 0,
        complaints: 0,
        replies: sent > 0 && back % 3 === 0 ? 1 : 0,
      });
    }
  }

  const lastEmailByLead = new Map<
    number,
    { id: string; mailboxId: string; threadId: string; rfcMessageId: string; sentAt: Date }
  >();
  const cite = (messageId: string, lead: LeadInfo, count: number) => {
    const findings = evidence.findings.get(lead.n) ?? [];
    const cited = findings.slice(0, count);
    if (cited.length === 0) {
      const signal = evidence.signals.get(lead.n);
      if (signal === undefined) throw new Error(`Seed lead ${String(lead.n)} has nothing citable.`);
      world.citations.push({
        id: seedId("mcit", world.citations.length + 1),
        messageId,
        signalId: signal,
      });
      return `[[s:${signal}]]`;
    }
    for (const findingId of cited)
      world.citations.push({
        id: seedId("mcit", world.citations.length + 1),
        messageId,
        findingId,
      });
    return cited.map((id) => `${evidence.claims.get(id) ?? ""} [[f:${id}]]`).join(" ");
  };

  for (const lead of leads) {
    const plan = enrollmentPlan(lead);
    const inReview = lead.status === "IN_REVIEW";
    if (plan === null && !inReview) continue;

    const steps = defaultSequence(lead.spec.line, lead.market).steps;
    const angleId = angleIdFor(lead.spec.line, lead.market, lead.company.domain !== null);
    const approvedAt = timeOf(lead, "APPROVED");
    const contactedAt = timeOf(lead, "CONTACTED");
    const afterContact =
      contactedAt === null ? null : lead.spec.trail[lead.spec.trail.indexOf("CONTACTED") + 1];
    const stopAt =
      afterContact === undefined || afterContact === null
        ? now
        : (timeOf(lead, afterContact) ?? now);
    const enrollmentId = plan === null ? null : seedId("enrl", world.enrollments.length + 1);
    const firstEmailStep = steps.findIndex((step) => step.channel === "EMAIL");
    // Old sends went through the mailbox that's now paused (its bounce rate paused it).
    const mailbox =
      contactedAt !== null && contactedAt < ago(now, { days: 8 }) && lead.n % 3 === 0
        ? mailboxId(4)
        : mailboxId(lead.n % 2 === 0 ? 1 : 2);
    const threadId = `seed-thread-${String(lead.n)}`;

    if (plan !== null && enrollmentId !== null) {
      if (lead.contactId === null)
        throw new Error(`Seed lead ${String(lead.n)} is enrolled but has no contact.`);
      const stoppedAt = plan.status === "STOPPED" ? stopAt : null;
      world.enrollments.push({
        id: enrollmentId,
        leadId: lead.id,
        contactId: lead.contactId,
        companyId: lead.companyId,
        sequenceId: sequenceId(lead.spec.line, lead.market),
        status: plan.status,
        currentStepIndex: Math.min(plan.sent, steps.length - 1),
        nextRunAt:
          plan.status === "ACTIVE"
            ? plan.sent === 0
              ? fromNow(now, { hours: 20 })
              : ago(now, { days: lead.n === 11 ? 1 : 2 })
            : plan.status === "PAUSED"
              ? fromNow(now, { days: 5 })
              : null,
        pausedUntil: plan.status === "PAUSED" ? fromNow(now, { days: 5 }) : null,
        pauseReason: plan.status === "PAUSED" ? "OUT_OF_OFFICE" : null,
        stoppedReason: plan.stoppedReason ?? null,
        stoppedAt,
        completedAt: plan.status === "COMPLETED" ? new Date(stopAt.getTime() - 86_400_000) : null,
        mailboxId: firstEmailStep >= 0 ? mailbox : null,
        createdAt: approvedAt ?? lead.createdAt,
      });
    }

    // ---- Sent steps ----
    // No cold email to Nigerian leads while the legal basis is pending (INV-25): their email
    // steps are skipped and only the WhatsApp touches (sent by hand) go out.
    const sendable = steps.filter((step) => lead.market !== "NIGERIA" || step.channel !== "EMAIL");
    const sent = Math.min(plan?.sent ?? 0, sendable.length);
    const start = contactedAt ?? now;
    const span = Math.max(stopAt.getTime() - start.getTime(), 3_600_000) * 0.85;
    for (let index = 0; index < sent; index += 1) {
      const step = sendable[index];
      if (step === undefined) continue;
      const sentAt = new Date(start.getTime() + (span * index) / Math.max(sent, 1));
      const messageN = world.messages.length + 1;
      const id = seedId("mesg", messageN);
      const body = `Hi ${firstName(lead)},\n\n${cite(id, lead, index === 0 ? 2 : 1)}\n\n${index === 0 ? "We help businesses like yours fix exactly this, at a fixed price." : "Following up in case my last note got buried."} Would a 15-minute call next week be useful?\n\n${ownerFirstName(lead)}`;
      const base = {
        id,
        leadId: lead.id,
        companyId: lead.companyId,
        contactId: lead.contactId,
        enrollmentId,
        stepIndex: step.index,
        kind: "SEQUENCE" as const,
        channel: step.channel,
        body,
        angleId,
        approvedById: approverId(lead),
        approvedAt: approvedAt ?? sentAt,
        createdAt: new Date(sentAt.getTime() - 3_600_000),
      };
      if (step.channel === "EMAIL") {
        const tokenId = seedId("utok", messageN);
        const bounced = lead.n === KEY_LEADS.hardBounce;
        const rfcMessageId = `<seed-${String(messageN)}@${mailbox === mailboxId(4) || mailbox === mailboxId(3) ? "futureunistudio.example" : "getfutureuni.example"}>`;
        world.messages.push({
          ...base,
          status: "SENT",
          subject:
            index === 0
              ? `A quick idea for ${lead.company.name}`.slice(0, 60)
              : `Re: A quick idea for ${lead.company.name}`.slice(0, 60),
          footerSnapshot: footer(lead, tokenId),
          scheduledFor: sentAt,
          sentAt,
          mailboxId: mailbox,
          providerMessageId: `mock-${String(messageN)}`,
          providerThreadId: threadId,
          rfcMessageId,
          unsubscribeTokenId: tokenId,
        });
        world.trackingEvents.push({
          id: seedId("trev", world.trackingEvents.length + 1),
          messageId: id,
          mailboxId: mailbox,
          type: bounced ? "BOUNCED_HARD" : "DELIVERED",
          provider: "mock",
          providerEventId: `seed-evt-${String(messageN)}`,
          occurredAt: new Date(sentAt.getTime() + 60_000),
          ...(bounced
            ? {
                payload: {
                  dsn: {
                    status: "5.1.1",
                    diagnostic:
                      "550 5.1.1 The email account that you tried to reach does not exist",
                  },
                },
              }
            : {}),
        });
        if (lead.n === KEY_LEADS.oneClickUnsubscribe) {
          world.trackingEvents.push({
            id: seedId("trev", world.trackingEvents.length + 1),
            messageId: id,
            mailboxId: mailbox,
            type: "UNSUBSCRIBED",
            provider: "mock",
            providerEventId: `seed-evt-${String(messageN)}-unsub`,
            occurredAt: stopAt,
            payload: { method: "one-click" },
          });
        }
        lastEmailByLead.set(lead.n, { id, mailboxId: mailbox, threadId, rfcMessageId, sentAt });
      } else {
        world.messages.push({
          ...base,
          status: "SENT_ASSISTED",
          sentAt,
          sentById: lead.ownerId,
          assistedOutcome: toJsonInput(
            AssistedOutcomeSchema.parse({
              channel: step.channel,
              sentAt: sentAt.toISOString(),
              sentById: lead.ownerId,
              note:
                step.channel === "WHATSAPP_ASSISTED"
                  ? "Sent from the business WhatsApp; two ticks."
                  : "Connection request with a note.",
            }),
          ),
        });
      }
    }

    // ---- The next touch: drafts in review, approved first touches, and one blocked send ----
    const draft = (
      status: MessageStatus,
      channel: Channel,
      extra: Partial<Prisma.MessageUncheckedCreateInput> = {},
    ) => {
      const messageN = world.messages.length + 1;
      const id = seedId("mesg", messageN);
      const body = `Hi ${firstName(lead)},\n\n${cite(id, lead, 2)}\n\nWe help businesses like yours fix exactly this, at a fixed price. Would a 15-minute call next week be useful?\n\n${ownerFirstName(lead)}`;
      world.messages.push({
        id,
        leadId: lead.id,
        companyId: lead.companyId,
        contactId: lead.contactId,
        enrollmentId,
        stepIndex: extra.stepIndex ?? 0,
        kind: "SEQUENCE",
        channel,
        status,
        ...(channel === "EMAIL"
          ? { subject: `A quick idea for ${lead.company.name}`.slice(0, 60) }
          : {}),
        body,
        angleId,
        createdAt: timeOf(lead, "IN_REVIEW") ?? lead.createdAt,
        ...extra,
      });
    };
    const firstChannel = steps[0]?.channel ?? "EMAIL";
    if (inReview) {
      if (lead.n === KEY_LEADS.linkedInCompliance) {
        draft("DRAFT", "LINKEDIN_ASSISTED", {
          kind: "ONE_OFF",
          stepIndex: null,
          personalizationNotes:
            "Email needs consent (UK sole trader): LinkedIn note sent by hand instead.",
        });
      } else if (lead.n === KEY_LEADS.needsEditDraft) {
        draft("NEEDS_EDIT", firstChannel, {
          rejectNote: "Mention the online booking page, not the homepage.",
          aiCallId: null,
        });
      } else if (lead.n === KEY_LEADS.rejectedDraft) {
        draft("REJECTED", firstChannel, {
          rejectReason: "TONE",
          rejectNote: "Too pushy for a first message.",
        });
        draft("DRAFT", firstChannel, { humanEdited: true });
      } else {
        draft(
          "DRAFT",
          firstChannel,
          lead.n === KEY_LEADS.crossSellLeader ? { aiCallId: AI_CALL.firstDraft } : {},
        );
      }
    } else if (lead.status === "APPROVED" && approvedAt !== null) {
      if (firstChannel === "EMAIL") {
        const scheduledFor = new Date(
          Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 8, 30),
        );
        draft("SCHEDULED", "EMAIL", {
          approvedById: approverId(lead),
          approvedAt,
          scheduledFor,
          mailboxId: mailbox,
        });
      } else {
        draft("PREPARED", firstChannel, { approvedById: approverId(lead), approvedAt });
      }
    } else if (lead.n === KEY_LEADS.oneClickUnsubscribe) {
      const next = steps[1];
      if (next !== undefined) {
        draft("BLOCKED", next.channel, {
          stepIndex: next.index,
          approvedById: approverId(lead),
          approvedAt: approvedAt ?? stopAt,
          scheduledFor: new Date(stopAt.getTime() + 2 * 86_400_000),
          blockedReason: "SUPPRESSED",
          mailboxId: mailbox,
          createdAt: stopAt,
        });
      }
    }
  }

  return { ...world, lastEmailByLead };
}
