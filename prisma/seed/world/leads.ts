/**
 * Leads, their STATUS_CHANGE trails, score reviews, the cross-sell group and line capacity
 * (data-model §10.2, §10.5). Trails come from data/leads.ts; every step is a transition the
 * lifecycle allows (world.test.ts checks), and each event carries the actor that would make it.
 */

import type { Actor, LeadStatus, ServiceLine } from "@/contracts/common";
import { ContactabilitySchema, type Contactability } from "@/contracts/enrichment";
import { ScoreReasonSchema, type ScoreReason } from "@/contracts/service-line-profile";
import { leadEventActor } from "@/modules/acquisition/core";
import { toJsonInput, type Prisma } from "@/platform/db";

import { KEY_LEADS } from "../data/leads";
import { ALL_LINES, LINE_CAPACITY, SEED_USERS } from "../data/users";
import { seedId } from "../lib/ids";
import { ago, fromNow } from "../lib/time";

import {
  approverId,
  byLead,
  CLOSED_STATUSES,
  lastTime,
  timeOf,
  userId,
  type LeadInfo,
  type Row,
} from "./base";
import { angleIdFor, profileOf } from "./profiles";

export interface LeadsWorld {
  leads: Row<Prisma.LeadUncheckedCreateInput>[];
  leadEvents: Row<Prisma.LeadEventUncheckedCreateInput>[];
  scoreReviews: Row<Prisma.ScoreReviewUncheckedCreateInput>[];
  crossSellGroups: Row<Prisma.CrossSellGroupUncheckedCreateInput>[];
  /** Written after the group exists (the lead and the group reference each other). */
  crossSellLinks: { leadId: string; crossSellGroupId: string }[];
  capacityStates: Row<Prisma.LineCapacityStateUncheckedCreateInput>[];
}

/** AiCall ids that other rows point at (platform.ts creates these calls). */
export const AI_CALL = {
  borderlineReview: seedId("aicl", 1),
  acceptedReview: seedId("aicl", 2),
  overriddenReview: seedId("aicl", 3),
  replyClassification: seedId("aicl", 4),
  precallBrief: seedId("aicl", 5),
  meetingSummary: seedId("aicl", 6),
  proposalDraft: seedId("aicl", 7),
  firstDraft: seedId("aicl", 8),
} as const;

const system = (job: string): Actor => ({ type: "SYSTEM", job });
function person(id: string): Actor {
  const user = SEED_USERS.find((candidate) => userId(candidate.key) === id);
  if (user === undefined) throw new Error(`Unknown seed user id ${id}.`);
  return { type: "USER", userId: id, role: user.role };
}

/** Who moves a lead into `to`, and the reason shown in its history. */
function transitionActor(
  lead: LeadInfo,
  from: LeadStatus,
  to: LeadStatus,
): { actor: Actor; reason: string | null } {
  const owner = person(lead.ownerId);
  switch (to) {
    case "ENRICHING":
    case "ENRICHED":
      return { actor: system("acquisition.enrichment.lead"), reason: null };
    case "AUDITING":
    case "AUDITED":
      return { actor: system("acquisition.audits.lead"), reason: null };
    case "SCORED":
      return { actor: system("acquisition.scoring.lead"), reason: null };
    case "IN_REVIEW":
      return {
        actor: system("acquisition.lead.advance"),
        reason: "First-touch draft ready for review",
      };
    case "APPROVED":
      return { actor: person(approverId(lead)), reason: null };
    case "PROPOSAL_SENT":
    case "WON":
      return { actor: owner, reason: null };
    case "CONTACTED":
      return lead.market === "NIGERIA"
        ? { actor: owner, reason: "WhatsApp first touch sent by hand" }
        : { actor: system("acquisition.outreach.send"), reason: null };
    case "REPLIED":
      return from === "MEETING_BOOKED"
        ? { actor: system("webhooks.calendar"), reason: "Meeting cancelled by the prospect" }
        : { actor: system("acquisition.inbox.process"), reason: null };
    case "MEETING_BOOKED":
      return lead.n === 50
        ? { actor: owner, reason: "Meeting arranged on WhatsApp" }
        : { actor: system("webhooks.calendar"), reason: null };
    case "LOST":
      return { actor: owner, reason: lostReason(lead) };
    case "NURTURE": {
      const reason = lead.spec.nurtureReason ?? "MANUAL";
      if (reason === "NOT_NOW") return { actor: system("acquisition.inbox.process"), reason };
      if (reason === "REENGAGE") return { actor: system("acquisition.pipeline.reengage"), reason };
      return { actor: system("acquisition.scoring.lead"), reason };
    }
    case "DISQUALIFIED":
      return {
        actor: system(
          from === "ENRICHED" ? "acquisition.enrichment.lead" : "acquisition.scoring.lead",
        ),
        reason: lead.spec.disqualifyReason ?? "low_score",
      };
    case "SUPPRESSED":
      return lead.n === KEY_LEADS.whatsappUnsubscribe || lead.n === KEY_LEADS.domainSuppressed
        ? {
            actor: person(userId("admin")),
            reason:
              lead.n === KEY_LEADS.domainSuppressed ? "Domain suppressed" : "Phone suppressed",
          }
        : {
            actor: system("acquisition.compliance.reevaluate"),
            reason: lead.n === KEY_LEADS.hardBounce ? "Hard bounce" : "Unsubscribed",
          };
    default:
      return { actor: system("acquisition.lead.advance"), reason: null };
  }
}

export function lostReason(
  lead: LeadInfo,
): "PRICE" | "CHOSE_COMPETITOR" | "NO_RESPONSE" | "TIMING" {
  switch (lead.n) {
    case 17:
      return "PRICE";
    case 35:
      return "CHOSE_COMPETITOR";
    case 73:
      return "TIMING";
    default:
      return "NO_RESPONSE";
  }
}

function scoreBand(score: number): "QUALIFIED" | "BORDERLINE" | "BELOW" {
  return score >= 61 ? "QUALIFIED" : score >= 40 ? "BORDERLINE" : "BELOW";
}

/** A plausible score explanation from the line's own rules (sorted by |points|, the contract's order). */
function scoreReasons(line: ServiceLine, score: number): ScoreReason[] {
  const rules = profileOf(line).scoring.rules;
  const lineRules = rules
    .filter((rule) => !rule.id.startsWith("common_"))
    .slice(0, score >= 61 ? 3 : 1);
  const common = rules.filter(
    (rule) => rule.id === "common_reachable_contact" || rule.id === "common_legal_form_known",
  );
  const reasons = [...lineRules, ...common].map((rule) =>
    ScoreReasonSchema.parse({ ruleId: rule.id, label: rule.label, points: rule.points }),
  );
  if (score < 40)
    reasons.push(
      ScoreReasonSchema.parse({
        ruleId: "common_large_company",
        label: "Large company",
        points: -15,
      }),
    );
  return reasons.sort((a, b) => Math.abs(b.points) - Math.abs(a.points));
}

const UK_INDIVIDUAL_FORMS = new Set(["SOLE_TRADER", "PARTNERSHIP"]);

function contactability(lead: LeadInfo, evaluatedAt: Date): Contactability {
  const contact = lead.contactIndex === null ? undefined : lead.company.contacts[lead.contactIndex];
  const country = lead.company.country;
  let email: Contactability["email"];
  if (contact?.email === undefined) email = { status: "BLOCKED", reason: "No email address found" };
  else if (country === "NG") {
    // acquisition.compliance.ngDirectMarketingBasis is PENDING_LEGAL_REVIEW (the default): no
    // cold email to Nigerian leads until it's recorded (INV-25); WhatsApp by hand may go ahead.
    email = {
      status: "REVIEW",
      reason: "Nigeria: the direct-marketing basis for email is pending legal review",
      ruleId: "NG.review",
    };
  } else if (lead.company.n === 45) {
    email = {
      status: "ALLOWED",
      reason: "Consent recorded: the owner asked us to email details",
      ruleId: "GB.consent",
    };
  } else if (country === "GB" && UK_INDIVIDUAL_FORMS.has(lead.company.legalForm)) {
    email = {
      status: "CONSENT_REQUIRED",
      reason: "UK sole traders and partnerships need consent before email (PECR)",
      ruleId: "GB.individual-subscriber",
    };
  } else if (country === "GB" && lead.company.legalForm === "UNKNOWN") {
    email = {
      status: "REVIEW",
      reason: "UK company with an unknown legal form: check before emailing",
      ruleId: "GB.unknown-form",
    };
  } else {
    email = {
      status: "ALLOWED",
      reason: "Business contact under legitimate interest",
      ruleId: `${country}.b2b`,
    };
  }
  const whatsappReady =
    country === "NG" &&
    contact?.phone !== undefined &&
    (contact.whatsapp === "CONFIRMED" || contact.whatsapp === "LIKELY");
  return ContactabilitySchema.parse({
    email,
    whatsapp: whatsappReady
      ? { status: "ASSISTED_ALLOWED", reason: "Nigerian mobile with WhatsApp; sent by hand" }
      : {
          status: "BLOCKED",
          reason: country === "NG" ? "No WhatsApp number" : "WhatsApp is used only in Nigeria",
        },
    linkedin:
      contact?.linkedin === undefined
        ? { status: "BLOCKED", reason: "No LinkedIn profile on record" }
        : { status: "ASSISTED_ALLOWED", reason: "Public LinkedIn profile; message sent by hand" },
    phone:
      contact?.phone === undefined
        ? { status: "BLOCKED", reason: "No phone number" }
        : { status: "CALL_TASK_ALLOWED", reason: "Business phone number" },
    lawfulBasis: lead.company.n === 45 ? "CONSENT" : "LEGITIMATE_INTEREST_B2B",
    evaluatedAt: evaluatedAt.toISOString(),
  });
}

export function buildLeads(
  now: Date,
  leads: readonly LeadInfo[],
  citable: ReadonlyMap<number, readonly string[]>,
): LeadsWorld {
  const world: LeadsWorld = {
    leads: [],
    leadEvents: [],
    scoreReviews: [],
    crossSellGroups: [],
    crossSellLinks: [],
    capacityStates: [],
  };
  const event = (row: Omit<Row<Prisma.LeadEventUncheckedCreateInput>, "id">) =>
    world.leadEvents.push({ id: seedId("levt", world.leadEvents.length + 1), ...row });

  for (const lead of leads) {
    const { spec } = lead;
    // Scored when scoring ran: at SCORED, or at the move straight out of AUDITED (a low-score
    // or compliance hold at scoring).
    const audited = spec.trail.indexOf("AUDITED");
    const afterAudit = audited === -1 ? undefined : spec.trail[audited + 1];
    const scoredAt =
      timeOf(lead, "SCORED") ?? (afterAudit === undefined ? null : timeOf(lead, afterAudit));
    const scored = scoredAt !== null && spec.score !== undefined;
    const enrichedAt = timeOf(lead, "ENRICHED");
    const verdict = enrichedAt === null ? null : contactability(lead, enrichedAt);
    const closed = CLOSED_STATUSES.includes(lead.status);
    const findings = citable.get(lead.n) ?? [];
    const angle = angleIdFor(spec.line, lead.market, lead.company.domain !== null);

    world.leads.push({
      id: lead.id,
      companyId: lead.companyId,
      serviceLine: spec.line,
      market: lead.market,
      country: lead.country,
      status: lead.status,
      ownerId: lead.ownerId,
      primaryContactId: lead.contactId,
      ...(scored
        ? {
            score: spec.score ?? null,
            scoreBand: scoreBand(spec.score ?? 0),
            scoreReasons: toJsonInput(scoreReasons(spec.line, spec.score ?? 0)),
            scoredAt,
            brief: `${lead.company.name} (${lead.company.industry.toLowerCase()}, ${lead.company.city}) fits the ${profileOf(spec.line).label} profile. ${findings.length > 0 ? "The audit found issues we can fix and cite." : "Few citable findings so far."}`,
            keyFindingIds: findings.slice(0, 3),
            suggestedAngleId: angle,
            talkingPoints: [
              "Lead with the measured finding, not the fix",
              "Offer the smallest package first",
              "Keep it to one question",
            ],
            briefGeneratedAt: new Date(scoredAt.getTime() + 5 * 60_000),
          }
        : { scoreReasons: [] }),
      needsHumanReview: spec.needsHumanReview === true,
      // project-rules "Definition: complianceReview": email CONSENT_REQUIRED or REVIEW, or a
      // Nigerian lead while the legal basis is pending.
      complianceReview:
        verdict !== null &&
        (verdict.email.status === "CONSENT_REQUIRED" ||
          verdict.email.status === "REVIEW" ||
          lead.market === "NIGERIA"),
      ...(verdict === null || enrichedAt === null
        ? {}
        : { contactability: toJsonInput(verdict), contactabilityEvaluatedAt: enrichedAt }),
      heldByCrossSell: spec.heldByCrossSell === true,
      nurtureReason: lead.status === "NURTURE" ? (spec.nurtureReason ?? "MANUAL") : null,
      disqualifyReason:
        lead.status === "DISQUALIFIED" ? (spec.disqualifyReason ?? "low_score") : null,
      nextActionAt:
        spec.nextActionIn === undefined ? null : fromNow(now, { days: spec.nextActionIn }),
      nextActionNote: spec.nextActionNote ?? null,
      firstContactedAt: timeOf(lead, "CONTACTED"),
      lastActivityAt: lastTime(lead),
      closedAt: closed ? lastTime(lead) : null,
      advanceVersion: spec.trail.length - 1,
      staleFlaggedAt: spec.stale === true ? ago(now, { days: 1 }) : null,
      createdAt: lead.createdAt,
    });

    // The trail: — → NEW, then one STATUS_CHANGE per step.
    const sourceJob = "acquisition.sourcing.run";
    const createdBy = lead.company.source === "manual" ? person(lead.ownerId) : system(sourceJob);
    event({
      leadId: lead.id,
      kind: "STATUS_CHANGE",
      fromStatus: null,
      toStatus: "NEW",
      ...leadEventActor(createdBy),
      reason: null,
      meta: { source: lead.company.source },
      createdAt: lead.createdAt,
    });
    spec.trail.forEach((to, index) => {
      if (index === 0) return;
      const from = spec.trail[index - 1];
      const at = lead.times[index];
      if (from === undefined || at === undefined) return;
      const { actor, reason } = transitionActor(lead, from, to);
      event({
        leadId: lead.id,
        kind: "STATUS_CHANGE",
        fromStatus: from,
        toStatus: to,
        ...leadEventActor(actor),
        reason,
        ...(to === "SCORED" && spec.score !== undefined ? { meta: { score: spec.score } } : {}),
        createdAt: at,
      });
    });
    if (spec.stale === true) {
      event({
        leadId: lead.id,
        kind: "FLAG",
        ...leadEventActor(system("acquisition.pipeline.stale-check")),
        reason: "No activity for 7 days",
        createdAt: ago(now, { days: 1 }),
      });
    }
  }

  // An ownership change on one lead, so the history shows more than status moves.
  const reassigned = byLead(leads, KEY_LEADS.needsEditDraft);
  event({
    leadId: reassigned.id,
    kind: "OWNER_CHANGE",
    ...leadEventActor(person(userId("webLead"))),
    reason: "Kelechi knows the practice",
    meta: { from: userId("webLead"), to: reassigned.ownerId },
    createdAt: new Date(reassigned.createdAt.getTime() + 3_600_000),
  });

  // Score reviews: one pending (the borderline lead), one accepted, one overridden.
  const review = (
    n: number,
    lead: LeadInfo,
    row: Omit<Row<Prisma.ScoreReviewUncheckedCreateInput>, "id" | "leadId" | "createdAt">,
  ) =>
    world.scoreReviews.push({
      id: seedId("scrv", n),
      leadId: lead.id,
      createdAt: new Date((timeOf(lead, "SCORED") ?? lead.createdAt).getTime() + 10 * 60_000),
      citedFindingIds: (citable.get(lead.n) ?? []).slice(0, 2),
      ...row,
    });
  const borderline = byLead(leads, KEY_LEADS.borderline);
  review(1, borderline, {
    recommendation: "NEEDS_HUMAN",
    confidence: 0.55,
    reasons: [
      "Clear need: the site is slow on mobile",
      "Only a generic inbox is verified; the director is hard to reach",
    ],
    riskFlags: ["contact_unverified"],
    aiCallId: AI_CALL.borderlineReview,
  });
  const accepted = byLead(leads, KEY_LEADS.needsEditDraft);
  review(2, accepted, {
    recommendation: "QUALIFY",
    confidence: 0.82,
    reasons: ["Owner-managed practice with a slow booking page"],
    aiCallId: AI_CALL.acceptedReview,
    humanDecision: "QUALIFY",
    decisionType: "ACCEPTED",
    decidedById: userId("webLead"),
    decidedAt: timeOf(accepted, "IN_REVIEW"),
  });
  const overridden = byLead(leads, 65);
  review(3, overridden, {
    recommendation: "DISQUALIFY",
    confidence: 0.61,
    reasons: ["Low posting cadence suggests little video budget"],
    riskFlags: ["low_budget_signal"],
    aiCallId: AI_CALL.overriddenReview,
    humanDecision: "QUALIFY",
    decisionType: "OVERRIDDEN",
    decidedById: userId("videoLead"),
    decidedAt: timeOf(overridden, "IN_REVIEW"),
    overrideNote:
      "The owner told us they plan weekly guest videos this season; worth a first touch.",
  });

  // The cross-sell company: two open qualified leads, web leading, graphic held.
  const leader = byLead(leads, KEY_LEADS.crossSellLeader);
  const held = byLead(leads, KEY_LEADS.crossSellHeld);
  const groupId = seedId("xsel", 1);
  world.crossSellGroups.push({
    id: groupId,
    companyId: leader.companyId,
    status: "ACTIVE",
    leadingLeadId: leader.id,
    detectedAt: timeOf(held, "SCORED") ?? now,
    createdAt: timeOf(held, "SCORED") ?? now,
  });
  world.crossSellLinks.push(
    { leadId: leader.id, crossSellGroupId: groupId },
    { leadId: held.id, crossSellGroupId: groupId },
  );

  world.capacityStates = ALL_LINES.map((line, index) => {
    const mode = LINE_CAPACITY[line];
    return {
      id: seedId("lcap", index + 1),
      serviceLine: line,
      mode,
      since: ago(now, { days: mode === "NORMAL" ? 30 : 3 }),
      lastNotifiedAt: mode === "NORMAL" ? null : ago(now, { days: 3 }),
    };
  });

  return world;
}
