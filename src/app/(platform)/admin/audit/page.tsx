import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/patterns/page-header";
import { EmptyState, PermissionState } from "@/components/patterns/states";
import { Badge } from "@/components/ui/badge";
import { RelativeTime } from "@/components/ui/relative-time";
import { FilterBar, UrlDateInput, UrlSearchInput } from "@/components/admin";
import { canFromUser, requireUser } from "@/platform/auth";
import { listAudit, type AuditQuery } from "@/platform/audit-log";

import { AuditExportButton } from "./_components/audit-export-button";

export const metadata: Metadata = { title: "Audit log · Admin" };

function fmt(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return "[unserialisable]";
  }
}

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  if (!canFromUser(user, "platform.audit.read")) {
    return <PermissionState description="Only administrators can read the audit log." />;
  }

  const sp = await searchParams;
  const one = (v: string | string[] | undefined): string | undefined =>
    Array.isArray(v) ? v[0] : v === "" ? undefined : v;

  const actorId = one(sp.actorId);
  const action = one(sp.action);
  const targetType = one(sp.targetType);
  const targetId = one(sp.targetId);
  const from = one(sp.from);
  const to = one(sp.to);
  const cursor = one(sp.cursor);

  const query: AuditQuery = {
    ...(actorId ? { actorId } : {}),
    ...(action ? { action } : {}),
    ...(targetType ? { targetType } : {}),
    ...(targetId ? { targetId } : {}),
    ...(from ? { from: new Date(`${from}T00:00:00.000Z`) } : {}),
    ...(to ? { to: new Date(`${to}T23:59:59.999Z`) } : {}),
    ...(cursor ? { cursor } : {}),
    limit: 25,
  };

  const { items, nextCursor } = await listAudit(query);

  const loadMore = new URLSearchParams();
  for (const [k, v] of Object.entries({ actorId, action, targetType, targetId, from, to })) {
    if (v) loadMore.set(k, v);
  }
  if (nextCursor !== null) loadMore.set("cursor", nextCursor);

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Admin"
        title="Audit log"
        description="Every change to users, roles, settings, credentials, profiles, suppressions and data requests. Append-only; sensitive values are redacted."
        actions={canFromUser(user, "platform.audit.export") ? <AuditExportButton /> : undefined}
      />

      <FilterBar>
        <UrlSearchInput paramKey="action" label="Action" placeholder="action, e.g. platform.user.changeRole" />
        <UrlSearchInput paramKey="actorId" label="Actor ID" placeholder="actor id" />
        <UrlSearchInput paramKey="targetType" label="Target type" placeholder="e.g. User" />
        <UrlSearchInput paramKey="targetId" label="Target ID" placeholder="target id" />
        <UrlDateInput paramKey="from" label="From" />
        <UrlDateInput paramKey="to" label="To" />
      </FilterBar>

      {items.length === 0 ? (
        <EmptyState title="No audit entries match" description="Adjust the filters to widen the search." />
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {items.map((entry) => {
            const before = fmt(entry.before);
            const after = fmt(entry.after);
            return (
              <li key={entry.id} className="flex flex-col gap-2 py-4">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="font-mono text-sm text-foreground">{entry.action}</span>
                  <Badge tone="neutral">{entry.targetType}</Badge>
                  <span className="font-mono text-xs text-muted">{entry.targetId}</span>
                </div>
                <p className="text-xs text-muted">
                  {entry.actorLabel ?? (entry.actorType === "SYSTEM" ? "System" : (entry.actorId ?? "Unknown"))}{" "}
                  · <RelativeTime value={entry.createdAt} timezone={user.timezone} />
                </p>
                {(before !== null || after !== null) && (
                  <details className="text-xs text-muted">
                    <summary className="cursor-pointer select-none">Before / after</summary>
                    <div className="mt-2 grid gap-3 sm:grid-cols-2">
                      <div>
                        <p className="mb-1 font-semibold uppercase tracking-[0.06em]">Before</p>
                        <pre className="overflow-auto rounded-md bg-zone p-2 font-mono text-[0.7rem] text-foreground">
                          {before ?? "—"}
                        </pre>
                      </div>
                      <div>
                        <p className="mb-1 font-semibold uppercase tracking-[0.06em]">After</p>
                        <pre className="overflow-auto rounded-md bg-zone p-2 font-mono text-[0.7rem] text-foreground">
                          {after ?? "—"}
                        </pre>
                      </div>
                    </div>
                  </details>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {nextCursor !== null && (
        <div>
          <Link
            href={`/admin/audit?${loadMore.toString()}`}
            className="inline-flex h-9 items-center rounded-md border border-input bg-surface px-3 text-sm font-semibold text-foreground hover:bg-primary-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            Load more
          </Link>
        </div>
      )}
    </div>
  );
}
