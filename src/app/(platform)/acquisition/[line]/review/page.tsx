import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/patterns/page-header";
import { PermissionState } from "@/components/patterns/states";
import { FilterBar, UrlSelect } from "@/components/admin";
import { actorOf, canFromUser, requireUser } from "@/platform/auth";
import { getReviewQueue } from "@/modules/acquisition/outreach";
import type { Market, ServiceLine } from "@/contracts/common";
import { resolveLine } from "@/modules/acquisition/ui/shell";
import { ReviewQueue } from "@/modules/acquisition/ui/review/review-queue";
import { getReviewContextAction } from "@/modules/acquisition/ui/review/actions";
import type { ReviewDraft, ReviewPermissions } from "@/modules/acquisition/ui/review/view";

export const metadata: Metadata = { title: "Review" };

const one = (v: string | string[] | undefined): string | undefined =>
  Array.isArray(v) ? v[0] : v === "" ? undefined : v;

/** Parse a numeric query param; absent or empty means "no filter" (NaN), never 0. */
const num = (v: string | string[] | undefined): number => {
  const s = one(v);
  return s === undefined || s === "" ? Number.NaN : Number(s);
};

export default async function ReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ line: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.ReactElement> {
  const { line: slug } = await params;
  const ctx = resolveLine(slug);
  if (ctx === null) notFound();

  const user = await requireUser();
  if (!canFromUser(user, "acquisition.review.read", { serviceLine: ctx.line })) {
    return (
      <PermissionState
        title="No access to this review queue"
        description="You can only review leads on the service lines you work on."
      />
    );
  }

  const sp = await searchParams;
  const marketParam = one(sp.market);
  const ownerParam = one(sp.owner);
  const channelParam = one(sp.channel);
  const flags = (one(sp.flags) ?? "").split(",").filter((f) => f.length > 0);
  const scoreMin = num(sp.scoreMin);
  const scoreMax = num(sp.scoreMax);
  const focusLead = one(sp.lead) ?? null;

  const isMember = user.role === "MEMBER";
  const ownerId = isMember ? user.id : ownerParam === "me" ? user.id : ownerParam;

  const queue = await getReviewQueue(actorOf(user), {
    serviceLine: ctx.line,
    limit: 100,
    ...(marketParam === undefined ? {} : { market: marketParam }),
    ...(ownerId === undefined ? {} : { ownerId }),
    ...(flags.includes("needsReview") ? { needsHumanReview: true } : {}),
    ...(flags.includes("complianceReview") ? { complianceReview: true } : {}),
  }).catch(() => ({ items: [], nextCursor: null }));

  let drafts: ReviewDraft[] = queue.items.map((item) => ({
    messageId: item.messageId,
    leadId: item.lead.id,
    companyId: item.company.id,
    contactId: item.contact?.id ?? null,
    channel: item.channel,
    stepIndex: item.stepIndex,
    isFirstTouch: item.stepIndex === 0,
    subject: item.subject,
    body: item.body,
    citedFindingIds: item.citedFindingIds,
    status: item.status,
    humanEdited: false,
    companyName: item.company.name,
    companyCountry: item.company.country,
    companyCity: item.company.city,
    contactName: item.contact?.name ?? null,
    contactRole: item.contact?.role ?? null,
    market: item.lead.market as Market,
    serviceLine: item.lead.serviceLine as ServiceLine,
    score: item.lead.score,
    scoreBand: item.lead.scoreBand,
    brief: item.lead.brief,
    needsHumanReview: item.lead.needsHumanReview,
    complianceReview: item.lead.complianceReview,
    heldByCrossSell: item.lead.heldByCrossSell,
  }));

  // Filters the service doesn't support yet (see phases/15/REQUESTS.md).
  if (channelParam !== undefined) drafts = drafts.filter((d) => d.channel === channelParam);
  if (!Number.isNaN(scoreMin)) drafts = drafts.filter((d) => (d.score ?? 0) >= scoreMin);
  if (!Number.isNaN(scoreMax)) drafts = drafts.filter((d) => (d.score ?? 0) <= scoreMax);

  const focusLeadId = focusLead ?? drafts[0]?.leadId ?? null;
  const contextResult = focusLeadId === null ? null : await getReviewContextAction(slug, focusLeadId);
  const initialContext = contextResult?.ok === true ? contextResult.data : null;

  const can = (action: Parameters<typeof canFromUser>[1]): boolean =>
    isMember ? true : canFromUser(user, action, { serviceLine: ctx.line });
  const permissions: ReviewPermissions = {
    canApprove: isMember ? user.canApprove : canFromUser(user, "acquisition.message.approve", { serviceLine: ctx.line }),
    canReject: can("acquisition.message.reject"),
    canDraft: can("acquisition.message.draft"),
    canSendAssisted: can("acquisition.message.sendAssisted"),
    canDecideReview: isMember ? user.canApprove : canFromUser(user, "acquisition.scoreReview.decide", { serviceLine: ctx.line }),
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader eyebrow={ctx.label} title="Review queue" description="Read the evidence, check the draft, and send." />
      <FilterBar>
        <UrlSelect
          paramKey="channel"
          label="Channel"
          options={[
            { value: "EMAIL", label: "Email" },
            { value: "WHATSAPP_ASSISTED", label: "WhatsApp" },
            { value: "LINKEDIN_ASSISTED", label: "LinkedIn" },
            { value: "CALL_TASK", label: "Call" },
          ]}
        />
        <UrlSelect
          paramKey="market"
          label="Market"
          options={[
            { value: "NIGERIA", label: "Nigeria" },
            { value: "INTERNATIONAL", label: "International" },
          ]}
        />
        <UrlSelect
          paramKey="flags"
          label="Flags"
          options={[
            { value: "needsReview", label: "Needs review" },
            { value: "complianceReview", label: "Compliance review" },
          ]}
        />
      </FilterBar>
      <ReviewQueue
        slug={slug}
        line={ctx.line}
        initialDrafts={drafts}
        initialContext={initialContext}
        initialLeadId={focusLeadId}
        permissions={permissions}
        timezone={user.timezone}
        nextDraftsExpected={null}
      />
    </div>
  );
}
