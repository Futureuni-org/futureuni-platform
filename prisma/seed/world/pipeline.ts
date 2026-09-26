/**
 * Meetings, proposals, deals and handoffs (data-model §10.8). Money is exact minor units in the
 * lead's currency, and every price sits inside its profile package's range (INV-11, INV-17). Each
 * handoff assigns all four lines, so the 16 active assignments produce exactly the team loads in
 * §10.2; TeamProfile.currentLoad is then computed from them (never seeded directly).
 */

import type { Currency, ServiceLine } from "@/contracts/common";
import {
  HandoffContentSchema,
  MeetingSummarySchema,
  PrecallBriefSchema,
  ProposalPackageSelectionSchema,
  ProposalSectionsSchema,
} from "@/contracts/acquisition-records";
import { toJsonInput, type Prisma } from "@/platform/db";

import { KEY_LEADS } from "../data/leads";
import { ALL_LINES, type UserKey } from "../data/users";
import { seedId } from "../lib/ids";
import { fixtureInfo } from "../lib/storage";
import { ago, dayOf, fromNow } from "../lib/time";

import type { SeedFile } from "./audits";
import {
  approverId,
  byLead,
  contactIdsByCompany,
  lastTime,
  timeOf,
  userId,
  websiteUrl,
  type LeadInfo,
  type Row,
} from "./base";
import { AI_CALL, lostReason } from "./leads";
import { mailboxId, type Evidence, type OutreachWorld } from "./outreach";
import { profileOf } from "./profiles";

export interface PipelineWorld {
  meetings: Row<Prisma.MeetingUncheckedCreateInput>[];
  proposals: Row<Prisma.ProposalUncheckedCreateInput>[];
  proposalLineItems: Row<Prisma.ProposalLineItemUncheckedCreateInput>[];
  /** Proposal emails (written before the proposals that point at them). */
  proposalMessages: Row<Prisma.MessageUncheckedCreateInput>[];
  proposalCitations: Row<Prisma.MessageCitationUncheckedCreateInput>[];
  proposalAttachments: Row<Prisma.MessageAttachmentUncheckedCreateInput>[];
  deals: Row<Prisma.DealUncheckedCreateInput>[];
  handoffs: Row<Prisma.HandoffUncheckedCreateInput>[];
  handoffAssignments: Row<Prisma.HandoffAssignmentUncheckedCreateInput>[];
  files: SeedFile[];
}

/**
 * Who delivers each line of each won deal. Sixteen active assignments: web.lead 3, kelechi 1,
 * uiux.lead 4, graphic.lead 4, manager 2, video.lead 1, zainab 1, admin 0 (§10.2).
 */
export const HANDOFF_ASSIGNMENTS: Readonly<Record<number, Readonly<Record<ServiceLine, UserKey>>>> =
  {
    16: {
      WEB_DEVELOPMENT: "webLead",
      UI_UX_DESIGN: "uiuxLead",
      GRAPHIC_DESIGN: "graphicLead",
      VIDEO_EDITING: "manager",
    },
    34: {
      WEB_DEVELOPMENT: "webLead",
      UI_UX_DESIGN: "uiuxLead",
      GRAPHIC_DESIGN: "graphicLead",
      VIDEO_EDITING: "manager",
    },
    52: {
      WEB_DEVELOPMENT: "webLead",
      UI_UX_DESIGN: "uiuxLead",
      GRAPHIC_DESIGN: "graphicLead",
      VIDEO_EDITING: "videoLead",
    },
    72: {
      WEB_DEVELOPMENT: "kelechi",
      UI_UX_DESIGN: "uiuxLead",
      GRAPHIC_DESIGN: "graphicLead",
      VIDEO_EDITING: "zainab",
    },
  };

interface ProposalPlan {
  n: number;
  lead: number;
  version: number;
  group?: number;
  status:
    "DRAFT" | "PENDING_APPROVAL" | "SENT" | "ACCEPTED" | "DECLINED" | "EXPIRED" | "SUPERSEDED";
  currency: Currency;
  items: { packageId: string; quantity: number; unitMajor: number }[];
  discountPercent?: number;
  declineReason?: string;
}

const PROPOSALS: readonly ProposalPlan[] = [
  {
    n: 1,
    lead: 15,
    version: 1,
    status: "SUPERSEDED",
    currency: "GBP",
    items: [{ packageId: "web_business", quantity: 1, unitMajor: 4_500 }],
  },
  {
    n: 2,
    lead: 15,
    version: 2,
    group: 1,
    status: "SENT",
    currency: "GBP",
    items: [{ packageId: "web_business", quantity: 1, unitMajor: 4_200 }],
  },
  {
    n: 3,
    lead: 33,
    version: 1,
    status: "SENT",
    currency: "NGN",
    items: [{ packageId: "uiux_flow_redesign", quantity: 1, unitMajor: 1_200_000 }],
  },
  {
    n: 4,
    lead: 51,
    version: 1,
    status: "SENT",
    currency: "GBP",
    items: [
      { packageId: "graphic_brand_identity", quantity: 1, unitMajor: 1_800 },
      { packageId: "graphic_social_pack", quantity: 1, unitMajor: 500 },
    ],
  },
  {
    n: 5,
    lead: 71,
    version: 1,
    status: "EXPIRED",
    currency: "NGN",
    items: [{ packageId: "video_shorts_pack", quantity: 3, unitMajor: 200_000 }],
  },
  {
    n: 6,
    lead: 71,
    version: 2,
    group: 5,
    status: "DRAFT",
    currency: "NGN",
    items: [{ packageId: "video_shorts_pack", quantity: 3, unitMajor: 200_000 }],
  },
  {
    n: 7,
    lead: 70,
    version: 1,
    status: "PENDING_APPROVAL",
    currency: "GBP",
    items: [{ packageId: "video_channel_retainer", quantity: 1, unitMajor: 1_600 }],
    discountPercent: 15,
  },
  {
    n: 8,
    lead: 16,
    version: 1,
    status: "ACCEPTED",
    currency: "NGN",
    items: [{ packageId: "web_business", quantity: 1, unitMajor: 1_850_000 }],
  },
  {
    n: 9,
    lead: 34,
    version: 1,
    status: "ACCEPTED",
    currency: "USD",
    items: [{ packageId: "uiux_design_system", quantity: 1, unitMajor: 6_800 }],
  },
  {
    n: 10,
    lead: 52,
    version: 1,
    status: "ACCEPTED",
    currency: "GBP",
    items: [{ packageId: "graphic_brand_identity", quantity: 1, unitMajor: 2_100 }],
  },
  {
    n: 11,
    lead: 17,
    version: 1,
    status: "DECLINED",
    currency: "USD",
    items: [{ packageId: "web_business", quantity: 1, unitMajor: 5_200 }],
    declineReason: "Budget: they'd hoped for something closer to $3,000.",
  },
  {
    n: 12,
    lead: 73,
    version: 1,
    status: "DECLINED",
    currency: "USD",
    items: [{ packageId: "video_channel_retainer", quantity: 1, unitMajor: 1_800 }],
    declineReason: "Timing: they'll revisit next quarter.",
  },
];

const PROPOSAL_FILE_N = 901;
const HANDOFF_FILE_N = 950;

function packageOf(line: ServiceLine, packageId: string) {
  const found = profileOf(line).pricing.packages.find((candidate) => candidate.id === packageId);
  if (found === undefined) throw new Error(`Package ${packageId} isn't in the ${line} profile.`);
  return found;
}

/** The package's price range in this currency; throws if a seeded price falls outside it. */
function checkedPrice(
  line: ServiceLine,
  packageId: string,
  currency: Currency,
  unitMinor: number,
): boolean {
  const range = packageOf(line, packageId).prices.find((price) => price.currency === currency);
  if (range === undefined) throw new Error(`Package ${packageId} has no ${currency} price.`);
  if (unitMinor < range.minMinor || unitMinor > range.maxMinor) {
    throw new Error(
      `Seed price ${String(unitMinor)} for ${packageId} is outside ${String(range.minMinor)}–${String(range.maxMinor)} ${currency}.`,
    );
  }
  return true;
}

export function buildPipeline(
  now: Date,
  leads: readonly LeadInfo[],
  outreach: OutreachWorld,
  evidence: Evidence,
): PipelineWorld {
  const world: PipelineWorld = {
    meetings: [],
    proposals: [],
    proposalLineItems: [],
    proposalMessages: [],
    proposalCitations: [],
    proposalAttachments: [],
    deals: [],
    handoffs: [],
    handoffAssignments: [],
    files: [],
  };
  const contacts = contactIdsByCompany();
  const meetingIdByLead = new Map<number, string>();
  const summaries = new Map<number, string>();

  // ---- Meetings ----
  const meeting = (
    lead: LeadInfo | null,
    row: Omit<Row<Prisma.MeetingUncheckedCreateInput>, "id" | "timezone"> & { timezone?: string },
  ) => {
    const id = seedId("meet", world.meetings.length + 1);
    const contact =
      lead?.contactIndex == null ? undefined : lead.company.contacts[lead.contactIndex];
    world.meetings.push({
      id,
      leadId: lead?.id ?? null,
      companyId: lead?.companyId ?? null,
      contactId: lead?.contactId ?? null,
      ownerId: lead?.ownerId ?? null,
      timezone: lead?.company.timezone ?? "Africa/Lagos",
      attendeeEmail: contact?.email ?? null,
      attendeeName:
        contact === undefined
          ? null
          : [contact.first, contact.last].filter(Boolean).join(" ") || null,
      ...row,
    });
    if (lead !== null) meetingIdByLead.set(lead.n, id);
    return id;
  };
  const heldAfterBooking = (lead: LeadInfo) => {
    const booked = timeOf(lead, "MEETING_BOOKED") ?? lead.createdAt;
    const next = lead.spec.trail[lead.spec.trail.indexOf("MEETING_BOOKED") + 1];
    const until = next === undefined ? now : (timeOf(lead, next) ?? now);
    return new Date(booked.getTime() + (until.getTime() - booked.getTime()) * 0.4);
  };
  const halfHour = (start: Date) => new Date(start.getTime() + 30 * 60_000);

  const booked90 = byLead(leads, 14);
  const soon = fromNow(now, { minutes: 90 });
  meeting(booked90, {
    source: "CAL_COM",
    externalId: "seed-cal-1",
    status: "SCHEDULED",
    startsAt: soon,
    endsAt: halfHour(soon),
    videoUrl: "https://meet.example.com/seed-1",
    reminder24hSentAt: new Date(soon.getTime() - 24 * 3_600_000),
    createdAt: timeOf(booked90, "MEETING_BOOKED") ?? now,
  });

  const tomorrowLead = byLead(leads, 32);
  const tomorrow = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 15),
  );
  const uiuxRange = packageOf("UI_UX_DESIGN", "uiux_flow_redesign").prices.find(
    (price) => price.currency === "USD",
  );
  const tomorrowFindings = evidence.findings.get(tomorrowLead.n) ?? [];
  meeting(tomorrowLead, {
    source: "CAL_COM",
    externalId: "seed-cal-2",
    status: "SCHEDULED",
    startsAt: tomorrow,
    endsAt: halfHour(tomorrow),
    videoUrl: "https://meet.example.com/seed-2",
    precallBrief: toJsonInput(
      PrecallBriefSchema.parse({
        summary: `${tomorrowLead.company.name} runs a patient app whose reviews keep mentioning sign-up trouble. They booked from the booking link in our second email.`,
        whatTheyCareAbout: [
          "Fewer abandoned sign-ups",
          "Parents booking without calling the front desk",
        ],
        likelyNeeds: ["A shorter sign-up flow", "Clearer appointment booking"],
        suggestedQuestions: [
          "Where do most people give up during sign-up?",
          "Who owns the app roadmap today?",
          "What would a good result look like in three months?",
          "Is there a launch date we should plan around?",
          "Who else needs to agree before starting?",
        ],
        suggestedPackage: {
          packageId: "uiux_flow_redesign",
          why: "One critical flow, redesigned and prototyped, matches the review complaints.",
        },
        priceRangeToDiscuss:
          uiuxRange === undefined
            ? null
            : { minMinor: uiuxRange.minMinor, maxMinor: uiuxRange.maxMinor, currency: "USD" },
        risks: ["The practice administrator may not own the budget"],
        citedFindingIds: tomorrowFindings.slice(0, 2),
      }),
    ),
    precallGeneratedAt: ago(now, { hours: 3 }),
    precallAiCallId: AI_CALL.precallBrief,
    createdAt: timeOf(tomorrowLead, "MEETING_BOOKED") ?? now,
  });

  const whatsappLead = byLead(leads, 50);
  const inThreeDays = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 3, 13),
  );
  meeting(whatsappLead, {
    source: "MANUAL",
    status: "SCHEDULED",
    startsAt: inThreeDays,
    endsAt: halfHour(inThreeDays),
    location: "WhatsApp call",
    notes: "Arranged on WhatsApp; bring printed label samples.",
    createdAt: timeOf(whatsappLead, "MEETING_BOOKED") ?? now,
  });

  const summarised = (lead: LeadInfo, text: string, packageId: string, needs: string[]) => {
    summaries.set(lead.n, text);
    return toJsonInput(
      MeetingSummarySchema.parse({
        summary: text,
        needs,
        budgetSignals: ["Has a budget set aside for this year"],
        decisionMakers: [
          [
            lead.company.contacts[lead.contactIndex ?? 0]?.first,
            lead.company.contacts[lead.contactIndex ?? 0]?.last,
          ]
            .filter(Boolean)
            .join(" ") || "Owner",
        ],
        objections: [],
        nextSteps: [
          {
            action: "Send a proposal",
            owner: "FUTUREUNI",
            due: dayOf(now, -2).toISOString().slice(0, 10),
          },
        ],
        recommendedPackageIds: [packageId],
      }),
    );
  };

  const held: [number, "CAL_COM" | "GOOGLE_CALENDAR" | "MANUAL", string | null][] = [
    [70, "CAL_COM", "video_channel_retainer"],
    [15, "GOOGLE_CALENDAR", null],
    [33, "CAL_COM", null],
    [51, "CAL_COM", null],
    [71, "MANUAL", null],
    [16, "CAL_COM", null],
    [72, "CAL_COM", "video_channel_retainer"],
    [73, "CAL_COM", null],
    [17, "GOOGLE_CALENDAR", null],
  ];
  for (const [n, source, summaryPackage] of held) {
    const lead = byLead(leads, n);
    const startsAt = heldAfterBooking(lead);
    meeting(lead, {
      source,
      ...(source === "MANUAL"
        ? {}
        : { externalId: `seed-${source === "CAL_COM" ? "cal" : "gcal"}-held-${String(n)}` }),
      status: "HELD",
      startsAt,
      endsAt: halfHour(startsAt),
      ...(source === "MANUAL"
        ? { location: "Their office" }
        : { videoUrl: `https://meet.example.com/seed-held-${String(n)}` }),
      outcomeNotes: "Good call; they want a written proposal.",
      reminder24hSentAt: new Date(startsAt.getTime() - 24 * 3_600_000),
      reminder1hSentAt: new Date(startsAt.getTime() - 3_600_000),
      ...(summaryPackage === null
        ? {}
        : {
            summary: summarised(
              lead,
              `${lead.company.name} wants a steady editing partner for weekly uploads and short clips.`,
              summaryPackage,
              ["Weekly long-form edits", "Short clips with captions"],
            ),
            summaryAiCallId: AI_CALL.meetingSummary,
          }),
      createdAt: timeOf(lead, "MEETING_BOOKED") ?? now,
    });
  }

  const noShow = byLead(leads, 35);
  const noShowAt = heldAfterBooking(noShow);
  meeting(noShow, {
    source: "CAL_COM",
    externalId: "seed-cal-noshow",
    status: "NO_SHOW",
    startsAt: noShowAt,
    endsAt: halfHour(noShowAt),
    createdAt: timeOf(noShow, "MEETING_BOOKED") ?? now,
  });

  const cancelled = byLead(leads, 13);
  const cancelledStart = fromNow(now, { days: 1 });
  meeting(cancelled, {
    source: "CAL_COM",
    externalId: "seed-cal-cancelled",
    status: "CANCELLED",
    startsAt: cancelledStart,
    endsAt: halfHour(cancelledStart),
    cancelledAt: lastTime(cancelled),
    createdAt: timeOf(cancelled, "MEETING_BOOKED") ?? now,
  });

  const unmatchedStart = fromNow(now, { days: 2 });
  meeting(null, {
    source: "CAL_COM",
    externalId: "seed-cal-unmatched",
    status: "UNMATCHED",
    startsAt: unmatchedStart,
    endsAt: halfHour(unmatchedStart),
    attendeeEmail: "kola.ade@unknown-sender.example",
    attendeeName: "Kola Ade",
    createdAt: ago(now, { hours: 6 }),
  });

  // ---- Proposals ----
  const proposalIds = new Map<number, string>();
  for (const plan of PROPOSALS) {
    const lead = byLead(leads, plan.lead);
    const line = lead.spec.line;
    const id = seedId("prop", plan.n);
    proposalIds.set(plan.n, id);
    const items = plan.items.map((item) => {
      const unitPriceMinor = item.unitMajor * 100;
      return {
        ...item,
        unitPriceMinor,
        name: packageOf(line, item.packageId).name,
        withinRange: checkedPrice(line, item.packageId, plan.currency, unitPriceMinor),
      };
    });
    const subtotalMinor = items.reduce((sum, item) => sum + item.unitPriceMinor * item.quantity, 0);
    const discountMinor =
      plan.discountPercent === undefined
        ? 0
        : Math.round((subtotalMinor * plan.discountPercent) / 100);
    const sent = plan.status !== "DRAFT" && plan.status !== "PENDING_APPROVAL";
    // Sent proposals go out at PROPOSAL_SENT (a superseded or expired first version five days
    // earlier); drafts and proposals awaiting approval were written yesterday.
    const proposalSentAt = timeOf(lead, "PROPOSAL_SENT");
    const replaced = PROPOSALS.some((other) => other.group === plan.n);
    const createdAt =
      proposalSentAt === null || plan.status === "DRAFT"
        ? ago(now, { days: 1 })
        : new Date(proposalSentAt.getTime() - (replaced ? 5 * 86_400_000 : 3_600_000));
    const sentAt = sent ? new Date(createdAt.getTime() + 3_600_000) : null;
    const pdfFileId = plan.status === "DRAFT" ? null : seedId("file", PROPOSAL_FILE_N + plan.n);
    if (pdfFileId !== null) {
      world.files.push({
        fixture: "proposalPdf",
        row: {
          id: pdfFileId,
          key: `seed/proposals/${id}.pdf`,
          purpose: "PROPOSAL_PDF",
          access: "PRIVATE",
          ...fixtureInfo("proposalPdf"),
          uploadedById: lead.ownerId,
          module: "acquisition",
          createdAt,
        },
      });
    }

    let sentMessageId: string | null = null;
    if (sent && sentAt !== null) {
      const messageN = 700 + plan.n;
      sentMessageId = seedId("mesg", messageN);
      const findingId = evidence.findings.get(lead.n)?.[0];
      const contact =
        lead.contactIndex === null ? undefined : lead.company.contacts[lead.contactIndex];
      const email = outreach.lastEmailByLead.get(lead.n);
      world.proposalMessages.push({
        id: sentMessageId,
        leadId: lead.id,
        companyId: lead.companyId,
        contactId: lead.contactId,
        kind: "ONE_OFF",
        channel: "EMAIL",
        status: "SENT",
        subject:
          `Proposal: ${packageOf(line, plan.items[0]?.packageId ?? "").name} for ${lead.company.name}`.slice(
            0,
            60,
          ),
        body: `Hi ${contact?.first ?? "there"},\n\nThanks for the call. As discussed, the proposal is attached.${findingId === undefined ? "" : ` ${evidence.claims.get(findingId) ?? ""} [[f:${findingId}]]`}\n\nBest`,
        humanConfirmedClaims: true,
        humanConfirmedById: lead.ownerId,
        humanConfirmedAt: sentAt,
        approvedById: approverId(lead),
        approvedAt: sentAt,
        sentAt,
        sentById: lead.ownerId,
        mailboxId: email?.mailboxId ?? mailboxId(1),
        providerMessageId: `mock-proposal-${String(plan.n)}`,
        providerThreadId: email?.threadId ?? `seed-thread-${String(lead.n)}`,
        rfcMessageId: `<seed-proposal-${String(plan.n)}@getfutureuni.example>`,
        unsubscribeTokenId: seedId("utok", messageN),
        footerSnapshot: `--\nFUTUREUNI\nNot interested? Reply "stop" or unsubscribe: http://localhost:3000/u/${seedId("utok", messageN)}\n[DEV PLACEHOLDER] FUTUREUNI, 1 Example Street, Lagos, Nigeria`,
        createdAt,
      });
      if (findingId !== undefined)
        world.proposalCitations.push({
          id: seedId("mcit", 700 + plan.n),
          messageId: sentMessageId,
          findingId,
        });
      if (pdfFileId !== null) {
        world.proposalAttachments.push({
          id: seedId("matt", plan.n),
          messageId: sentMessageId,
          fileObjectId: pdfFileId,
          filename: `FUTUREUNI-proposal-${String(plan.n)}.pdf`,
        });
      }
    }

    const packages = ProposalPackageSelectionSchema.parse(
      items.map((item) => ({
        packageId: item.packageId,
        name: item.name,
        quantity: item.quantity,
        unitPriceMinor: item.unitPriceMinor,
        currency: plan.currency,
        withinRange: item.withinRange,
      })),
    );
    world.proposals.push({
      id,
      leadId: lead.id,
      proposalGroupId: plan.group === undefined ? id : seedId("prop", plan.group),
      version: plan.version,
      status: plan.status,
      currency: plan.currency,
      packages: toJsonInput(packages),
      discountType: plan.discountPercent === undefined ? "NONE" : "PERCENT",
      discountValue: plan.discountPercent === undefined ? 0 : plan.discountPercent * 100,
      subtotalMinor,
      discountMinor,
      totalMinor: subtotalMinor - discountMinor,
      validUntil: plan.status === "EXPIRED" ? dayOf(now, 6) : dayOf(sentAt ?? now, -14),
      ...(plan.status === "DRAFT"
        ? {}
        : {
            sections: toJsonInput(
              ProposalSectionsSchema.parse({
                understanding: `${lead.company.name} told us what's slowing them down, and our audit backs it up.`,
                solution: `We'll deliver the ${packages.map((selection) => selection.name).join(" and ")} package.`,
                scope: items
                  .map((item) => packageOf(line, item.packageId).includes.join("; "))
                  .join(". "),
                timeline:
                  "Work starts within a week of acceptance; milestones are agreed at kickoff.",
                investmentIntro: "The investment below is fixed for the scope above.",
                whyFutureuni: "A senior team that works your hours.",
                terms: "Terms to be confirmed in the engagement letter.",
                nextSteps: "Reply to accept, or book a call to talk it through.",
              }),
            ),
          }),
      pdfFileId,
      requiresApproval: plan.status === "PENDING_APPROVAL",
      approvalReason:
        plan.status === "PENDING_APPROVAL"
          ? "The 15% discount is above the 10% a service lead can give."
          : null,
      sentAt,
      sentMessageId,
      acceptedAt: plan.status === "ACCEPTED" ? lastTime(lead) : null,
      declinedAt: plan.status === "DECLINED" ? lastTime(lead) : null,
      declineReason: plan.declineReason ?? null,
      aiCallId: plan.status === "PENDING_APPROVAL" ? AI_CALL.proposalDraft : null,
      createdById: lead.ownerId,
      createdAt,
    });
    items.forEach((item, index) => {
      world.proposalLineItems.push({
        id: seedId("pitm", world.proposalLineItems.length + 1),
        proposalId: id,
        packageId: item.packageId,
        description: item.name,
        quantity: item.quantity,
        unitPriceMinor: item.unitPriceMinor,
        totalMinor: item.unitPriceMinor * item.quantity,
        sortOrder: index,
        createdAt,
      });
    });
  }

  // ---- Deals ----
  const won: {
    lead: number;
    proposal: number | null;
    valueMinor: number;
    currency: Currency;
    packageIds: string[];
  }[] = [
    {
      lead: 16,
      proposal: 8,
      valueMinor: 185_000_000,
      currency: "NGN",
      packageIds: ["web_business"],
    },
    {
      lead: 34,
      proposal: 9,
      valueMinor: 680_000,
      currency: "USD",
      packageIds: ["uiux_design_system"],
    },
    {
      lead: 52,
      proposal: 10,
      valueMinor: 210_000,
      currency: "GBP",
      packageIds: ["graphic_brand_identity"],
    },
    {
      lead: KEY_LEADS.activeClientWin,
      proposal: null,
      valueMinor: 65_000_000,
      currency: "NGN",
      packageIds: ["video_channel_retainer"],
    },
  ];
  for (const deal of won) {
    const lead = byLead(leads, deal.lead);
    const closedAt = lastTime(lead);
    const dealId = seedId("deal", world.deals.length + 1);
    world.deals.push({
      id: dealId,
      leadId: lead.id,
      companyId: lead.companyId,
      serviceLine: lead.spec.line,
      market: lead.market,
      outcome: "WON",
      valueMinor: deal.valueMinor,
      currency: deal.currency,
      services: [...ALL_LINES],
      packageIds: deal.packageIds,
      proposalId: deal.proposal === null ? null : (proposalIds.get(deal.proposal) ?? null),
      startDate: dayOf(closedAt, -7),
      notes: deal.proposal === null ? "Agreed on the call; no written proposal needed." : null,
      closedAt,
      closedById: lead.ownerId,
      createdAt: closedAt,
    });

    // The handoff: an immutable snapshot, then one delivery owner per line.
    const handoffId = seedId("hoff", world.handoffs.length + 1);
    const acknowledged = deal.lead === 16 || deal.lead === 34;
    const pdfFileId = seedId("file", HANDOFF_FILE_N + world.handoffs.length + 1);
    world.files.push({
      fixture: "handoffPdf",
      row: {
        id: pdfFileId,
        key: `seed/handoffs/${handoffId}.pdf`,
        purpose: "HANDOFF_PDF",
        access: "PRIVATE",
        ...fixtureInfo("handoffPdf"),
        module: "acquisition",
        createdAt: closedAt,
      },
    });
    const companyContacts = lead.company.contacts
      .map((contact, index) => ({ contact, id: contacts.get(lead.company.n)?.[index] }))
      .filter((entry) => entry.contact.anonymized !== true && entry.id !== undefined)
      .map(({ contact, id }) => ({
        id: id ?? "",
        name: [contact.first, contact.last].filter(Boolean).join(" ") || null,
        role: contact.role ?? null,
        email: contact.email ?? null,
        phone: contact.phone ?? null,
      }));
    const findings = (evidence.findings.get(lead.n) ?? []).slice(0, 3);
    const meetingId = meetingIdByLead.get(lead.n);
    const meetingSummary = summaries.get(lead.n);
    const proposalFile =
      deal.proposal === null ? undefined : seedId("file", PROPOSAL_FILE_N + deal.proposal);
    const content = HandoffContentSchema.parse({
      company: {
        id: lead.companyId,
        name: lead.company.name,
        website: websiteUrl(lead.company),
        country: lead.company.country,
        city: lead.company.city,
      },
      contacts: companyContacts,
      market: lead.market,
      services: [...ALL_LINES],
      scope: deal.packageIds.flatMap((packageId) => packageOf(lead.spec.line, packageId).includes),
      timeline: {
        startDate: dayOf(closedAt, -7).toISOString().slice(0, 10),
        notes: "Kickoff in the first week; milestones agreed then.",
      },
      value: { amountMinor: deal.valueMinor, currency: deal.currency },
      paymentNotes: "Payment terms to be confirmed with the client at kickoff.",
      keyFindings: findings.map((findingId) => ({
        findingId,
        claim: (evidence.claims.get(findingId) ?? "").slice(0, 240),
      })),
      meetingSummaries:
        meetingId !== undefined && meetingSummary !== undefined
          ? [{ meetingId, summary: meetingSummary }]
          : [],
      files:
        proposalFile === undefined
          ? []
          : [{ fileObjectId: proposalFile, label: "Accepted proposal" }],
      proposalId: deal.proposal === null ? null : (proposalIds.get(deal.proposal) ?? null),
      snapshotAt: closedAt.toISOString(),
    });
    const lineLead = {
      WEB_DEVELOPMENT: "webLead",
      UI_UX_DESIGN: "uiuxLead",
      GRAPHIC_DESIGN: "graphicLead",
      VIDEO_EDITING: "videoLead",
    } as const;
    const acknowledgedAt = acknowledged ? new Date(closedAt.getTime() + 86_400_000) : null;
    world.handoffs.push({
      id: handoffId,
      dealId,
      companyId: lead.companyId,
      status: acknowledged ? "ACKNOWLEDGED" : "NEW",
      content: toJsonInput(content),
      pdfFileId,
      markdown: `# Handoff: ${lead.company.name}\n\n- Services: all four lines\n- Value: ${String(deal.valueMinor / 100)} ${deal.currency}\n- Start: ${content.timeline.startDate ?? "to confirm"}\n`,
      acknowledgedAt,
      acknowledgedById: acknowledged ? userId(lineLead[lead.spec.line]) : null,
      createdAt: closedAt,
    });
    const assignments = HANDOFF_ASSIGNMENTS[deal.lead];
    if (assignments === undefined)
      throw new Error(`No handoff assignments for seed lead ${String(deal.lead)}.`);
    for (const line of ALL_LINES) {
      const assignee = userId(assignments[line]);
      world.handoffAssignments.push({
        id: seedId("hasg", world.handoffAssignments.length + 1),
        handoffId,
        serviceLine: line,
        suggestedUserId: assignee,
        assignedUserId: assignee,
        assignedById: userId("manager"),
        assignedAt: new Date(closedAt.getTime() + 2 * 3_600_000),
        acknowledgedAt,
        active: true,
        createdAt: closedAt,
      });
    }
  }

  for (const n of [17, 35, 53, 73]) {
    const lead = byLead(leads, n);
    const reason = lostReason(lead);
    const closedAt = lastTime(lead);
    world.deals.push({
      id: seedId("deal", world.deals.length + 1),
      leadId: lead.id,
      companyId: lead.companyId,
      serviceLine: lead.spec.line,
      market: lead.market,
      outcome: "LOST",
      services: [lead.spec.line],
      proposalId:
        n === 17 ? (proposalIds.get(11) ?? null) : n === 73 ? (proposalIds.get(12) ?? null) : null,
      lostReason: reason,
      competitor: reason === "CHOSE_COMPETITOR" ? "Another Lagos agency" : null,
      lostNote: reason === "NO_RESPONSE" ? "No reply after the full sequence." : null,
      reengageAt: reason === "TIMING" ? dayOf(now, -21) : null,
      closedAt,
      closedById: lead.ownerId,
      createdAt: closedAt,
    });
  }
  return world;
}
