import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ShieldAlert } from "lucide-react";

import { PageHeader } from "@/components/patterns/page-header";
import { PermissionState } from "@/components/patterns/states";
import { MarketBadge } from "@/components/ui/market-badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { IdSchema, MARKET_CURRENCIES, type ServiceLine } from "@/contracts/common";
import { AppError } from "@/lib/errors";
import { actorOf, canFromUser, requireUser } from "@/platform/auth";
import { getBookingLink } from "@/modules/acquisition/pipeline";
import { loadThread } from "@/modules/acquisition/ui/inbox/thread-data";
import { conversationOnly } from "@/modules/acquisition/ui/inbox/thread-types";
import { lineHref, resolveLine } from "@/modules/acquisition/ui/leads/_seams";
import { ActivityTab, parseActivityKind } from "@/modules/acquisition/ui/leads/activity-tab";
import { ConversationTab } from "@/modules/acquisition/ui/leads/conversation-tab";
import { DealPanel } from "@/modules/acquisition/ui/leads/deal-panel";
import { DetailLayout } from "@/modules/acquisition/ui/leads/detail-layout";
import { DetailTabNav } from "@/modules/acquisition/ui/leads/detail-tab-nav";
import {
  parseDetailTab,
  type DetailCapabilities,
  type DetailTabId,
} from "@/modules/acquisition/ui/leads/detail-types";
import { EvidenceTab } from "@/modules/acquisition/ui/leads/evidence-tab";
import { enumLabel, SERVICE_LINE_LABEL } from "@/modules/acquisition/ui/leads/format";
import { canReauditIn } from "@/modules/acquisition/ui/leads/lead-actions";
import {
  loadActivity,
  loadDeal,
  loadEvidence,
  loadMeetings,
  loadNotes,
  loadOverview,
  loadPackages,
  loadProposals,
} from "@/modules/acquisition/ui/leads/lead-detail-data";
import {
  getCrossSellSiblings,
  getLeadHeader,
  type LeadHeaderView,
} from "@/modules/acquisition/ui/leads/lead-detail.repo";
import { LeadHeaderActions } from "@/modules/acquisition/ui/leads/lead-header-actions";
import { listLeadProposalRefs } from "@/modules/acquisition/ui/leads/lead-pipeline.repo";
import { MeetingsTab } from "@/modules/acquisition/ui/leads/meetings-tab";
import { NotesTab } from "@/modules/acquisition/ui/leads/notes-tab";
import { OverviewTab } from "@/modules/acquisition/ui/leads/overview-tab";
import { loadLineOwners, loadOwnersByLine } from "@/modules/acquisition/ui/leads/owners";
import { ProposalsTab } from "@/modules/acquisition/ui/leads/proposals-tab";
import { safeHttpUrl } from "@/modules/acquisition/ui/leads/safe-url";
import { ScoreMeter } from "@/modules/acquisition/ui/leads/score-meter";
import { withPerson } from "@/modules/acquisition/ui/leads/select-options";
import { LeadSideRail } from "@/modules/acquisition/ui/leads/side-rail";
import { ToneBadge } from "@/modules/acquisition/ui/leads/tone-badge";

export const metadata: Metadata = { title: "Lead" };

type SearchParams = Record<string, string | string[] | undefined>;

/** The company's social profiles as links. Scraped text: only http(s) URLs become an `href`. */
function socialLinks(socials: unknown): { label: string; url: string }[] {
  if (typeof socials !== "object" || socials === null || Array.isArray(socials)) return [];
  return Object.entries(socials).flatMap(([key, value]) => {
    const url = typeof value === "string" ? safeHttpUrl(value) : null;
    return url === null ? [] : [{ label: enumLabel(key), url }];
  });
}

function HeaderMeta({
  header,
  siblings,
}: {
  header: LeadHeaderView;
  siblings: { id: string; serviceLine: ServiceLine }[];
}) {
  const { company } = header;
  const place = [company.city, header.country ?? company.country].filter(
    (v) => v !== null && v !== "",
  );
  const links = [
    ...(company.website === null
      ? []
      : [{ label: company.normalizedDomain ?? "Website", url: company.website }]),
    ...socialLinks(company.socials),
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted">
        {place.length > 0 && <span>{place.join(", ")}</span>}
        {links.map((link) => (
          <a
            key={link.url}
            href={link.url}
            target="_blank"
            rel="noreferrer noopener"
            className="text-primary hover:underline"
          >
            {link.label}
          </a>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge kind="lead" value={header.status} />
        <MarketBadge market={header.market} />
        {header.needsHumanReview && <ToneBadge tone="warning">Needs review</ToneBadge>}
        {header.complianceReview && (
          <ToneBadge tone="danger" icon={ShieldAlert}>
            Compliance review
          </ToneBadge>
        )}
        <ScoreMeter score={header.score} band={header.scoreBand} />
      </div>
      {siblings.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted">Cross-sell:</span>
          {siblings.map((sibling) => (
            <Link
              key={sibling.id}
              href={lineHref(sibling.serviceLine, `leads/${sibling.id}`)}
              className="rounded-full bg-info-soft px-3 py-1 text-xs font-medium text-info hover:underline"
            >
              Also a {SERVICE_LINE_LABEL[sibling.serviceLine]} lead
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

async function loadBookingLink(
  leadId: string,
  ownerId: string | undefined,
): Promise<string | null> {
  try {
    return await getBookingLink(leadId, ownerId);
  } catch (error) {
    // No booking page set up, or the calendar provider is unavailable: the lead still opens, just
    // without the "copy booking link" shortcut. Anything unexpected is thrown.
    if (error instanceof AppError) return null;
    throw error;
  }
}

export default async function LeadDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ line: string; leadId: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { line: slug, leadId } = await params;
  const ctx = resolveLine(slug);
  if (ctx === null || !IdSchema.safeParse(leadId).success) notFound();

  const user = await requireUser();
  if (!canFromUser(user, "acquisition.lead.read", { serviceLine: ctx.line })) {
    return (
      <PermissionState
        title="No access to this line"
        description="You can only view leads for the service lines you work on."
      />
    );
  }

  const header = await getLeadHeader(leadId);
  // A lead outside this line reads as not found, never as "forbidden" (project-rules: 404).
  if (header?.serviceLine !== ctx.line) notFound();

  const sp = await searchParams;
  const tab = parseDetailTab(sp.tab);
  const actor = actorOf(user);
  const timezone = user.timezone;
  const detailPath = lineHref(ctx.line, `leads/${leadId}`);

  const scope = {
    serviceLine: ctx.line,
    ...(header.owner === null ? {} : { ownerId: header.owner.id }),
  };
  const may = (action: Parameters<typeof canFromUser>[1]) => canFromUser(user, action, scope);
  const capabilities: DetailCapabilities = {
    update: may("acquisition.lead.update"),
    assign: may("acquisition.lead.assign"),
    rescore: may("acquisition.lead.rescore"),
    reaudit: may("acquisition.lead.reaudit"),
    disqualify: may("acquisition.lead.disqualify"),
    dismissFinding: may("acquisition.finding.dismiss"),
    decideReview: may("acquisition.scoreReview.decide"),
    sendOneOff: may("acquisition.message.sendOneOff"),
    manageMeetings: may("acquisition.meeting.manage"),
    createProposal: may("acquisition.proposal.create"),
    approveProposal: may("acquisition.proposal.approve"),
    approveException: may("acquisition.proposal.approveException"),
    sendProposal: may("acquisition.proposal.send"),
    closeDeal: may("acquisition.deal.close"),
    assignHandoff: may("acquisition.handoff.assign"),
    // Admin-only actions, read from the matrix rather than from the role. Suppressing a lead has
    // no action of its own yet, so it uses the one that undoes a suppression (CR-16-LEAD-SUPPRESS).
    suppress: canFromUser(user, "acquisition.suppression.remove"),
    dataRequest: canFromUser(user, "acquisition.dsr.manage"),
    seeCosts: canFromUser(user, "platform.aiUsage.read"),
  };

  const isClosed = header.status === "WON" || header.status === "LOST";
  const [owners, siblings, deal, proposalRefs, bookingLink] = await Promise.all([
    loadLineOwners(user, ctx.line),
    getCrossSellSiblings(leadId),
    // A deal row outlives a re-engaged lead (one deal per lead), so the outcome panel is only
    // shown while the lead is actually won or lost. See CR-16-DEAL-RECLOSE.
    isClosed ? loadDeal(leadId) : Promise.resolve(null),
    capabilities.closeDeal ? listLeadProposalRefs(leadId) : Promise.resolve([]),
    capabilities.manageMeetings ? loadBookingLink(leadId, header.owner?.id) : Promise.resolve(null),
  ]);
  // A delivery owner comes from the team of the service being delivered, which on a cross-sold
  // deal isn't always this line's.
  const handedOff = deal?.handoff == null ? [] : deal.deal.services;
  const teamByLine =
    capabilities.assignHandoff && handedOff.length > 0
      ? await loadOwnersByLine(user, handedOff)
      : {};
  const ownerOptions = withPerson(owners, header.owner);

  const emailContacts = header.contacts.flatMap((c) =>
    c.email === null ? [] : [{ id: c.id, label: `${c.name ?? "Unnamed contact"} (${c.email})` }],
  );

  /** Loads and renders the active tab only. A tab the user may not read shows a permission state. */
  const renderTab = async (active: DetailTabId): Promise<ReactNode> => {
    try {
      switch (active) {
        case "overview":
          return (
            <OverviewTab
              leadId={leadId}
              overview={await loadOverview(header)}
              needsHumanReview={header.needsHumanReview}
              capabilities={capabilities}
              evidenceHref={`${detailPath}?tab=evidence`}
              timezone={timezone}
            />
          );
        case "evidence":
          return (
            <EvidenceTab
              leadId={leadId}
              audits={await loadEvidence(actor, leadId, capabilities.seeCosts)}
              capabilities={capabilities}
              canRerun={capabilities.reaudit && canReauditIn(header.status)}
              timezone={timezone}
            />
          );
        case "conversation":
          return (
            <ConversationTab
              leadId={leadId}
              thread={conversationOnly(await loadThread(actor, leadId))}
              contacts={emailContacts}
              // A suppressed lead is never messaged, so the composer isn't offered for one.
              canSend={capabilities.sendOneOff && header.status !== "SUPPRESSED"}
              timezone={timezone}
            />
          );
        case "meetings":
          return (
            <MeetingsTab
              // Remounted when `?new=1` comes or goes, so following a "book a meeting" link opens
              // the form even when this tab is already showing.
              key={sp.new === "1" ? "new" : "list"}
              leadId={leadId}
              meetings={await loadMeetings(leadId)}
              canManage={capabilities.manageMeetings}
              bookingLink={bookingLink}
              openNew={sp.new === "1"}
              timezone={timezone}
            />
          );
        case "proposals": {
          const [proposals, pricing] = await Promise.all([
            loadProposals(leadId),
            // The company's country, as `createProposal` uses, so the builder offers the same price
            // book the saved proposal will be priced from.
            loadPackages(ctx.line, header.market, header.company.country),
          ]);
          return (
            <ProposalsTab
              key={sp.new === "1" ? "new" : "list"}
              leadId={leadId}
              proposals={proposals}
              packages={pricing?.packages ?? null}
              currency={pricing?.currency ?? null}
              contacts={emailContacts}
              capabilities={capabilities}
              openNew={sp.new === "1"}
              timezone={timezone}
            />
          );
        }
        case "activity": {
          const kind = parseActivityKind(sp.kind);
          return (
            <ActivityTab
              events={await loadActivity(leadId, kind)}
              kind={kind}
              basePath={detailPath}
              timezone={timezone}
            />
          );
        }
        case "notes":
          return (
            <NotesTab
              leadId={leadId}
              notes={await loadNotes(actor, leadId)}
              teammates={owners}
              canAdd={capabilities.update}
              timezone={timezone}
            />
          );
      }
    } catch (error) {
      if (error instanceof AppError && error.code === "FORBIDDEN") {
        return (
          <PermissionState
            title="You can't view this part of the lead"
            description="It is limited to the lead's owner and the people who manage this line."
          />
        );
      }
      throw error;
    }
  };

  const content = await renderTab(tab);

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        breadcrumbs={
          <Link
            href={lineHref(ctx.line, "leads")}
            className="inline-flex items-center gap-1 text-sm text-muted hover:text-foreground"
          >
            <ArrowLeft aria-hidden className="size-4" />
            {ctx.label} leads
          </Link>
        }
        eyebrow={ctx.label}
        title={header.company.name}
        actions={
          <LeadHeaderActions
            leadId={leadId}
            companyName={header.company.name}
            status={header.status}
            serviceLine={ctx.line}
            capabilities={capabilities}
            detailPath={detailPath}
            reviewHref={lineHref(ctx.line, "review", { lead: leadId })}
            bookingLink={bookingLink}
            currencies={MARKET_CURRENCIES[header.market]}
            timezone={timezone}
            proposals={proposalRefs.map((p) => ({
              id: p.id,
              label: `Version ${String(p.version)} · ${enumLabel(p.status)}`,
            }))}
          />
        }
        tabs={
          <div className="flex flex-col gap-6">
            <HeaderMeta header={header} siblings={siblings} />
            <DetailTabNav basePath={detailPath} active={tab} />
          </div>
        }
      />

      <DetailLayout
        main={
          <div className="flex flex-col gap-10">
            {deal !== null && (
              <DealPanel
                deal={deal.deal}
                handoff={deal.handoff}
                capabilities={capabilities}
                teamByLine={teamByLine}
              />
            )}
            {content}
          </div>
        }
        rail={
          <LeadSideRail
            header={header}
            capabilities={capabilities}
            owners={ownerOptions}
            timezone={timezone}
            now={new Date()}
          />
        }
      />
    </div>
  );
}
