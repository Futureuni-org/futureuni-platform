import "server-only";

/**
 * Server-side loaders for the lead-detail tabs. Each one calls the owning service (which authorises)
 * and the interim reads, signs any private file URL, and returns a plain view (`detail-types.ts`)
 * the tab components render. The page loads only the active tab's data.
 */

import type {
  Actor,
  Currency,
  DiscountType,
  LeadEventKind,
  Market,
  ServiceLine,
} from "@/contracts/common";
import {
  HandoffContentSchema,
  MeetingSummarySchema,
  PrecallBriefSchema,
  ProposalSectionsSchema,
} from "@/contracts/acquisition-records";
import { FindingEvidenceSchema } from "@/contracts/audit-agent";
import { AppError } from "@/lib/errors";
import { getSignedUrl } from "@/platform/storage";
import { getAuditsForLead } from "@/modules/acquisition/audits";
import { getLeadScore } from "@/modules/acquisition/scoring";
import { listLeadNotes } from "@/modules/acquisition/pipeline";
import { getProfileContext } from "@/modules/acquisition/pipeline/profile-context";

import type {
  ActivityView,
  DealView,
  EvidenceArtifact,
  EvidenceAuditView,
  EvidenceMetric,
  HandoffView,
  MeetingView,
  NoteView,
  OverviewView,
  PackageOption,
  ProposalView,
} from "./detail-types";
import { getLeadActivity, getLeadSignals, type LeadHeaderView } from "./lead-detail.repo";
import {
  getFindingClaims,
  getFindingExtras,
  getLeadDeal,
  listLeadMeetings,
  listLeadProposals,
} from "./lead-pipeline.repo";
import { safeHttpUrl } from "./safe-url";

const SIGNED_URL_TTL_SECONDS = 600;
const NUMBER = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 2 });

// An audit's internal cost, held in micro-USD (ADR-027). Not client money: it is formatted here,
// on the server, the way the admin AI-usage page does, so no client code touches the figure.
const MICROS_PER_USD = 1_000_000;
const COST = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});

async function sign(key: string | null | undefined): Promise<string | null> {
  if (key == null || key === "") return null;
  try {
    return await getSignedUrl(key, SIGNED_URL_TTL_SECONDS);
  } catch {
    return null;
  }
}

/** "lcpSeconds" → "Lcp seconds": a readable label for an evidence metric key. */
function humanise(key: string): string {
  const spaced = key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function metricValue(value: number | string | boolean): string {
  if (typeof value === "number") return NUMBER.format(value);
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return value;
}

// ---- Overview ---------------------------------------------------------------------------------

export async function loadOverview(header: LeadHeaderView): Promise<OverviewView> {
  const [score, findings, signals] = await Promise.all([
    getLeadScore(header.id),
    getFindingClaims(header.keyFindingIds),
    getLeadSignals(header.id),
  ]);

  const review = score?.review ?? null;
  return {
    brief: header.brief,
    talkingPoints: header.talkingPoints,
    topFindings: findings.map((f) => ({ id: f.id, claim: f.claim, severity: f.severity })),
    reasons: (score?.reasons ?? []).map((r) => ({
      ruleId: r.ruleId,
      label: r.label,
      points: r.points,
    })),
    review:
      review === null
        ? null
        : {
            recommendation: review.recommendation,
            confidence: review.confidence,
            reasons: review.reasons,
            riskFlags: review.riskFlags,
            decisionType: review.decisionType,
            humanDecision: review.humanDecision,
            overrideNote: review.overrideNote,
          },
    signals: signals.map((s) => ({
      id: s.id,
      signalType: s.signalType,
      evidenceText: s.evidenceText,
      sourceUrl: safeHttpUrl(s.sourceUrl),
      observedAt: s.observedAt.toISOString(),
      adapterId: s.adapterId,
    })),
  };
}

// ---- Evidence ---------------------------------------------------------------------------------

/**
 * `seeCosts` is whether the viewer may see what an audit cost (`platform.aiUsage.read`). When they
 * may not, the figure never leaves the server.
 */
export async function loadEvidence(
  actor: Actor,
  leadId: string,
  seeCosts: boolean,
): Promise<EvidenceAuditView[]> {
  // getAuditsForLead authorises `acquisition.lead.read` before anything else is read.
  const audits = await getAuditsForLead(actor, leadId);
  const extras = await getFindingExtras(leadId);

  return Promise.all(
    audits.map(async (audit): Promise<EvidenceAuditView> => {
      const findings = await Promise.all(
        audit.findings.map(async (finding) => {
          const extra = extras.get(finding.id);
          const parsed = FindingEvidenceSchema.safeParse(extra?.evidence);
          const evidence = parsed.success ? parsed.data : {};

          const metrics: EvidenceMetric[] = [
            ...Object.entries(evidence.metrics ?? {}).map(([key, value]) => {
              const threshold = evidence.thresholds?.[key];
              return {
                key: humanise(key),
                value: metricValue(value),
                threshold: threshold === undefined ? null : NUMBER.format(threshold),
              };
            }),
            ...Object.entries(evidence.counts ?? {}).map(([key, value]) => ({
              key: humanise(key),
              value: NUMBER.format(value),
              threshold: null,
            })),
          ];

          const signed = await Promise.all(
            (evidence.artifacts ?? []).map(async (artifact): Promise<EvidenceArtifact | null> => {
              const url = await sign(artifact.key);
              return url === null
                ? null
                : { url, label: artifact.label, viewport: artifact.viewport ?? null };
            }),
          );
          const artifacts = signed.filter((a): a is EvidenceArtifact => a !== null);
          const fallbackUrl = safeHttpUrl(finding.artifactUrl);
          if (artifacts.length === 0 && fallbackUrl !== null) {
            artifacts.push({ url: fallbackUrl, label: "Screenshot", viewport: null });
          }

          return {
            id: finding.id,
            checkId: finding.checkId,
            severity: finding.severity,
            claim: finding.claim,
            method: finding.method,
            confidence: finding.confidence,
            pitchable: finding.pitchable,
            sourceUrl: safeHttpUrl(finding.sourceUrl),
            capturedAt: finding.capturedAt.toISOString(),
            dismissedAt: finding.dismissedAt === null ? null : finding.dismissedAt.toISOString(),
            dismissReason: extra?.dismissReason ?? null,
            metrics,
            observations: evidence.observations ?? [],
            quotes: (evidence.quotes ?? []).map((q) => ({
              text: q.text,
              sourceUrl: safeHttpUrl(q.sourceUrl),
            })),
            artifacts,
          };
        }),
      );

      return {
        id: audit.id,
        agentId: audit.agentId,
        status: audit.status,
        costLabel: seeCosts ? COST.format(audit.costMicros / MICROS_PER_USD) : null,
        finishedAt: audit.finishedAt === null ? null : audit.finishedAt.toISOString(),
        notAssessed: audit.checkRuns
          .filter((run) => run.status !== "OK")
          .map((run) => ({ checkId: run.checkId, status: run.status, reason: run.reason })),
        findings,
      };
    }),
  );
}

// ---- Meetings ---------------------------------------------------------------------------------

export async function loadMeetings(leadId: string): Promise<MeetingView[]> {
  const meetings = await listLeadMeetings(leadId);
  return meetings.map((m) => {
    const summary = MeetingSummarySchema.safeParse(m.summary);
    const brief = PrecallBriefSchema.safeParse(m.precallBrief);
    return {
      id: m.id,
      status: m.status,
      source: m.source,
      startsAt: m.startsAt.toISOString(),
      endsAt: m.endsAt.toISOString(),
      timezone: m.timezone,
      location: m.location,
      videoUrl: safeHttpUrl(m.videoUrl),
      attendeeName: m.attendeeName,
      notes: m.notes,
      outcomeNotes: m.outcomeNotes,
      summary: summary.success ? summary.data : null,
      precallBrief: brief.success ? brief.data : null,
      precallGeneratedAt: m.precallGeneratedAt === null ? null : m.precallGeneratedAt.toISOString(),
    };
  });
}

// ---- Proposals --------------------------------------------------------------------------------

export async function loadPackages(
  serviceLine: ServiceLine,
  market: Market,
  country: string | null,
): Promise<{ currency: Currency; packages: PackageOption[] } | null> {
  try {
    const context = await getProfileContext(serviceLine, market, country);
    return {
      currency: context.currency,
      packages: context.packages.map((p) => ({
        id: p.id,
        name: p.name,
        minMinor: p.minMinor,
        typicalMinor: p.typicalMinor,
        maxMinor: p.maxMinor,
        currency: p.currency,
      })),
    };
  } catch (error) {
    // No active profile for the line means "no packages to offer". Any other failure is a real
    // one and is thrown, not shown as an empty price list.
    if (error instanceof AppError && error.code === "NOT_FOUND") return null;
    throw error;
  }
}

/** The discount as it was entered, so revising a proposal starts from the same terms. */
function discountOf(type: DiscountType, value: number): ProposalView["discount"] {
  if (type === "PERCENT") return { type: "PERCENT", valueBps: value };
  if (type === "AMOUNT") return { type: "AMOUNT", valueMinor: value };
  return { type: "NONE" };
}

export async function loadProposals(leadId: string): Promise<ProposalView[]> {
  const proposals = await listLeadProposals(leadId);
  return Promise.all(
    proposals.map(async (p): Promise<ProposalView> => {
      const sections = ProposalSectionsSchema.safeParse(p.sections);
      return {
        id: p.id,
        groupId: p.proposalGroupId,
        version: p.version,
        status: p.status,
        currency: p.currency,
        subtotalMinor: p.subtotalMinor,
        discountMinor: p.discountMinor,
        taxMinor: p.taxMinor,
        totalMinor: p.totalMinor,
        validUntil: p.validUntil.toISOString(),
        discount: discountOf(p.discountType, p.discountValue),
        notes: p.notes,
        requiresApproval: p.requiresApproval,
        approvalReason: p.approvalReason,
        sentAt: p.sentAt === null ? null : p.sentAt.toISOString(),
        declineReason: p.declineReason,
        pdfUrl: await sign(p.pdfFile?.key),
        sections: sections.success ? sections.data : null,
        lines: p.lineItems,
        createdAt: p.createdAt.toISOString(),
      };
    }),
  );
}

// ---- Deal and handoff -------------------------------------------------------------------------

export async function loadDeal(
  leadId: string,
): Promise<{ deal: DealView; handoff: HandoffView | null } | null> {
  const deal = await getLeadDeal(leadId);
  if (deal === null) return null;

  const person = (u: { id: string; name: string } | null) =>
    u === null ? null : { id: u.id, name: u.name };

  let handoff: HandoffView | null = null;
  if (deal.handoff !== null) {
    const content = HandoffContentSchema.safeParse(deal.handoff.content);
    handoff = {
      id: deal.handoff.id,
      status: deal.handoff.status,
      acknowledgedAt:
        deal.handoff.acknowledgedAt === null ? null : deal.handoff.acknowledgedAt.toISOString(),
      scope: content.success ? content.data.scope : [],
      assignments: deal.handoff.assignments.map((a) => ({
        serviceLine: a.serviceLine,
        suggested: person(a.suggestedUser),
        assigned: person(a.assignedUser),
      })),
    };
  }

  return {
    deal: {
      id: deal.id,
      outcome: deal.outcome,
      valueMinor: deal.valueMinor,
      currency: deal.currency,
      services: deal.services,
      startDate: deal.startDate === null ? null : deal.startDate.toISOString(),
      notes: deal.notes,
      lostReason: deal.lostReason,
      competitor: deal.competitor,
      lostNote: deal.lostNote,
      reengageAt: deal.reengageAt === null ? null : deal.reengageAt.toISOString(),
      closedAt: deal.closedAt.toISOString(),
    },
    handoff,
  };
}

// ---- Activity and notes -----------------------------------------------------------------------

export async function loadActivity(
  leadId: string,
  kind: LeadEventKind | null,
): Promise<ActivityView[]> {
  const events = await getLeadActivity(leadId, kind);
  return events.map((e) => ({
    id: e.id,
    kind: e.kind,
    fromStatus: e.fromStatus,
    toStatus: e.toStatus,
    actorLabel: e.actorLabel,
    reason: e.reason,
    createdAt: e.createdAt.toISOString(),
  }));
}

export async function loadNotes(actor: Actor, leadId: string): Promise<NoteView[]> {
  const notes = await listLeadNotes(actor, leadId);
  return notes.map((n) => ({
    id: n.id,
    authorName: n.authorName,
    body: n.body,
    createdAt: n.createdAt.toISOString(),
  }));
}
