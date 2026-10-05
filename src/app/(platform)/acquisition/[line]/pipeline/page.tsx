import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/patterns/page-header";
import { PermissionState } from "@/components/patterns/states";
import { Money } from "@/components/ui/money";
import { IdSchema, type LeadStatus } from "@/contracts/common";
import { actorOf, canFromUser, requireUser } from "@/platform/auth";
import { lineHref, resolveLine } from "@/modules/acquisition/ui/shell";
import { loadLineOwners } from "@/modules/acquisition/ui/leads/owners";
import { withPerson } from "@/modules/acquisition/ui/leads/select-options";
import {
  loadBoard,
  loadLeadSheet,
  loadWonThisMonth,
  parseBoardFilters,
} from "@/modules/acquisition/ui/pipeline/board-data";
import { BoardFilterBar } from "@/modules/acquisition/ui/pipeline/board-filters";
import { PipelineBoard } from "@/modules/acquisition/ui/pipeline/pipeline-board";

export const metadata: Metadata = { title: "Pipeline" };

const COUNT = new Intl.NumberFormat("en-GB");
const OPEN_STAGES: readonly LeadStatus[] = [
  "CONTACTED",
  "REPLIED",
  "MEETING_BOOKED",
  "PROPOSAL_SENT",
];

export default async function PipelinePage({
  params,
  searchParams,
}: {
  params: Promise<{ line: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { line: slug } = await params;
  const ctx = resolveLine(slug);
  if (ctx === null) notFound();

  const user = await requireUser();
  if (!canFromUser(user, "acquisition.pipeline.read", { serviceLine: ctx.line })) {
    return (
      <PermissionState
        title="No access to this line"
        description="You can only view the pipeline of the service lines you work on."
      />
    );
  }

  const sp = await searchParams;
  const filters = parseBoardFilters(sp);
  const actor = actorOf(user);
  const selected = Array.isArray(sp.lead) ? sp.lead[0] : sp.lead;
  const sheetLeadId =
    selected !== undefined &&
    IdSchema.safeParse(selected).success &&
    canFromUser(user, "acquisition.lead.read", { serviceLine: ctx.line })
      ? selected
      : null;

  const [board, won, owners, sheet] = await Promise.all([
    loadBoard(actor, user, ctx.line, filters),
    loadWonThisMonth(actor, ctx.line, filters.market, user.timezone, new Date()),
    loadLineOwners(user, ctx.line),
    sheetLeadId === null ? Promise.resolve(null) : loadLeadSheet(sheetLeadId, ctx.line),
  ]);

  // The owner the board is filtered by is always in the select, even when they aren't on this
  // line's team (or the viewer can't list it). Otherwise the select would read "Any owner" while
  // the board showed one person's leads.
  const ownerOptions = withPerson(
    owners,
    filters.ownerId === undefined ? null : { id: filters.ownerId, name: null },
  );

  // A count of leads, not money: stage values stay per stage and per currency, as the service gives them.
  const openLeads = board.columns
    .filter((column) => OPEN_STAGES.includes(column.status))
    .reduce((total, column) => total + column.stageCount, 0);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={ctx.label}
        title="Pipeline"
        description={`${COUNT.format(openLeads)} open ${openLeads === 1 ? "lead" : "leads"}`}
        actions={
          won === null ? undefined : (
            <dl className="flex flex-col gap-1 text-right">
              <dt className="text-xs font-semibold tracking-[0.08em] text-muted uppercase">
                Won this month
              </dt>
              <dd className="flex flex-wrap items-center justify-end gap-x-2 text-lg text-heading">
                {won.length === 0 ? (
                  <span className="text-base text-muted">Nothing yet</span>
                ) : (
                  won.map((row, index) => (
                    <span key={row.currency} className="flex items-center gap-2">
                      {index > 0 && <span aria-hidden>·</span>}
                      <Money
                        value={{ amountMinor: row.amountMinor, currency: row.currency }}
                        compact
                      />
                    </span>
                  ))
                )}
              </dd>
            </dl>
          )
        }
      />

      <BoardFilterBar owners={ownerOptions} basePath={lineHref(ctx.line, "pipeline")} />

      <PipelineBoard
        board={board}
        serviceLine={ctx.line}
        leadsPath={lineHref(ctx.line, "leads")}
        timezone={user.timezone}
        sheet={sheet}
        showNurture={filters.showNurture}
        showAwaiting={filters.showAwaiting}
      />
    </div>
  );
}
