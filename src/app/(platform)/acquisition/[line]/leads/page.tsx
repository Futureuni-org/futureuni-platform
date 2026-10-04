import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/patterns/page-header";
import { PermissionState } from "@/components/patterns/states";
import { canFromUser, requireUser } from "@/platform/auth";
import { resolveLine, lineHref } from "@/modules/acquisition/ui/leads/_seams";
import { ButtonLink, DownloadLink } from "@/modules/acquisition/ui/leads/button-link";
import { loadLineOwners } from "@/modules/acquisition/ui/leads/owners";
import {
  builtinViews,
  LEAD_FILTER_KEYS,
  parseLeadFilters,
} from "@/modules/acquisition/ui/leads/lead-filters";
import {
  countLeads,
  listFilterOptions,
  listLeads,
} from "@/modules/acquisition/ui/leads/leads-list.repo";
import { listSavedViews } from "@/modules/acquisition/ui/leads/saved-views.repo";
import { withPerson } from "@/modules/acquisition/ui/leads/select-options";
import { toLeadRowView } from "@/modules/acquisition/ui/leads/leads-view";
import { LeadsClient } from "@/modules/acquisition/ui/leads/leads-client";
import type { LeadCapabilities } from "@/modules/acquisition/ui/leads/bulk-actions-bar";

export const metadata: Metadata = { title: "Leads" };

const COUNT = new Intl.NumberFormat("en-GB");

/** The leads list's own params from the URL, one string each. Anything else in the URL is left out. */
function flattenQuery(sp: Record<string, string | string[] | undefined>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of LEAD_FILTER_KEYS) {
    const value = sp[key];
    // `flags` may repeat (`?flags=a&flags=b`); every other param takes its first value.
    const v = Array.isArray(value) ? (key === "flags" ? value.join(",") : value[0]) : value;
    if (typeof v === "string" && v !== "") out[key] = v;
  }
  return out;
}

export default async function LeadsPage({
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
  if (!canFromUser(user, "acquisition.lead.read", { serviceLine: ctx.line })) {
    return (
      <PermissionState
        title="No access to this line"
        description="You can only view leads for the service lines you work on."
      />
    );
  }

  const sp = await searchParams;
  const filter = parseLeadFilters(sp, user.timezone);
  const query = flattenQuery(sp);
  const basePath = lineHref(ctx.line, "leads");

  const [page, total, options, savedViews, owners] = await Promise.all([
    listLeads({ serviceLine: ctx.line, filter }),
    countLeads(ctx.line),
    listFilterOptions(ctx.line),
    listSavedViews(user.id, ctx.line),
    loadLineOwners(user, ctx.line),
  ]);

  const capabilities: LeadCapabilities = {
    assign: canFromUser(user, "acquisition.lead.assign", { serviceLine: ctx.line }),
    update: canFromUser(user, "acquisition.lead.update", {
      serviceLine: ctx.line,
      ownerId: user.id,
    }),
    rescore: canFromUser(user, "acquisition.lead.rescore", {
      serviceLine: ctx.line,
      ownerId: user.id,
    }),
    reaudit: canFromUser(user, "acquisition.lead.reaudit", {
      serviceLine: ctx.line,
      ownerId: user.id,
    }),
    disqualify: canFromUser(user, "acquisition.lead.disqualify", {
      serviceLine: ctx.line,
      ownerId: user.id,
    }),
    // Admin only, read from the matrix: see `bulkSuppressAction` for why this action is the gate.
    suppress: canFromUser(user, "acquisition.suppression.remove"),
    exportCsv: canFromUser(user, "acquisition.lead.export", { serviceLine: ctx.line }),
  };

  const canCreate = canFromUser(user, "acquisition.lead.create", { serviceLine: ctx.line });
  const exportQs = new URLSearchParams(query).toString();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={ctx.label}
        title="Leads"
        description={`${COUNT.format(total)} ${total === 1 ? "lead" : "leads"} in this line`}
        actions={
          <div className="flex items-center gap-2">
            {canCreate && (
              <ButtonLink href={lineHref(ctx.line, "search")} variant="secondary">
                Add lead
              </ButtonLink>
            )}
            {capabilities.exportCsv && (
              <DownloadLink
                href={exportQs.length > 0 ? `${basePath}/export?${exportQs}` : `${basePath}/export`}
                variant="ghost"
                download
              >
                Export CSV
              </DownloadLink>
            )}
          </div>
        }
      />

      <LeadsClient
        initialRows={page.items.map((row) => toLeadRowView(row, ctx.line))}
        initialCursor={page.nextCursor}
        serviceLine={ctx.line}
        query={query}
        basePath={basePath}
        timezone={user.timezone}
        owners={owners}
        // "My leads" filters by the viewer, who may not be on this line's team (a manager, say),
        // so they are always in the owner filter; otherwise the select would read "Any owner".
        ownerFilter={withPerson(owners, { id: user.id, name: user.name })}
        sources={options.sources}
        signalTypes={options.signalTypes}
        builtins={builtinViews(user.id, new Date(), user.timezone)}
        savedViews={savedViews}
        capabilities={capabilities}
      />
    </div>
  );
}
