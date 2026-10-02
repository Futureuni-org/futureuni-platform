import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/patterns/page-header";
import { EmptyState, PermissionState } from "@/components/patterns/states";
import { StatusBadge } from "@/components/ui/status-badge";
import { RelativeTime } from "@/components/ui/relative-time";
import { SettingsSection, AdminTable, FilterBar, UrlSearchInput, UrlSelect, type AdminColumn } from "@/components/admin";
import { actorOf, canFromUser, requireUser } from "@/platform/auth";
import { listJobRuns, type JobRunSummary } from "@/platform/jobs";
import { getCronSchedules } from "@/platform/registry";
import type { JobStatus } from "@/contracts/common";

import { RunActions, RunNowButton } from "./_components/jobs-client";

export const metadata: Metadata = { title: "Jobs · Admin" };

const STATUSES = new Set<JobStatus>(["QUEUED", "RUNNING", "SUCCEEDED", "FAILED", "CANCELLED"]);

function duration(started: Date | null, finished: Date | null): string {
  if (started === null || finished === null) return "—";
  const secs = Math.max(0, Math.round((finished.getTime() - started.getTime()) / 1000));
  return secs < 60 ? `${String(secs)}s` : `${String(Math.floor(secs / 60))}m ${String(secs % 60)}s`;
}

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  if (!canFromUser(user, "platform.job.read")) {
    return <PermissionState description="Only administrators and managers can view jobs." />;
  }

  const sp = await searchParams;
  const one = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v === "" ? undefined : v);
  const name = one(sp.name);
  const statusParam = one(sp.status);
  const cursor = one(sp.cursor);
  const status = statusParam !== undefined && STATUSES.has(statusParam as JobStatus) ? (statusParam as JobStatus) : undefined;

  const actor = actorOf(user);
  const { items, nextCursor } = await listJobRuns(actor, {
    ...(name === undefined ? {} : { name }),
    ...(status === undefined ? {} : { status }),
    ...(cursor === undefined ? {} : { cursor }),
    limit: 50,
  });
  const schedules = getCronSchedules();
  const canRetry = canFromUser(user, "platform.job.retry");
  const canCancel = canFromUser(user, "platform.job.cancel");
  const canRunNow = canFromUser(user, "platform.job.runNow");

  const columns: AdminColumn<JobRunSummary>[] = [
    { key: "name", header: "Job", className: "font-mono", cell: (r) => r.name },
    { key: "status", header: "Status", cell: (r) => <StatusBadge kind="job" value={r.status} /> },
    { key: "queued", header: "Queued", cell: (r) => <RelativeTime value={r.queuedAt} timezone={user.timezone} /> },
    { key: "duration", header: "Duration", align: "right", className: "font-mono tabular-nums", cell: (r) => duration(r.startedAt, r.finishedAt) },
    { key: "attempt", header: "Attempt", align: "right", className: "font-mono tabular-nums", cell: (r) => String(r.attempt) },
    {
      key: "detail",
      header: "Detail",
      cell: (r) => (
        <details className="text-xs text-muted">
          <summary className="cursor-pointer select-none">
            {r.errorSummary !== null ? <span className="text-danger">error</span> : "counts"}
          </summary>
          <pre className="mt-1 max-w-xs overflow-auto rounded-md bg-zone p-2 font-mono text-[0.7rem]">
            {r.errorSummary ?? JSON.stringify(r.counts ?? {}, null, 2)}
          </pre>
        </details>
      ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      cell: (r) => <RunActions jobRunId={r.id} status={r.status} canRetry={canRetry} canCancel={canCancel} />,
    },
  ];

  const loadMore = new URLSearchParams();
  if (name !== undefined) loadMore.set("name", name);
  if (status !== undefined) loadMore.set("status", status);
  if (nextCursor !== null) loadMore.set("cursor", nextCursor);

  return (
    <div className="flex flex-col gap-10">
      <PageHeader eyebrow="Admin" title="Jobs" description="Background job runs and the schedules that drive them." />

      <SettingsSection eyebrow="Runs" title="Recent runs" emphasized>
        <FilterBar>
          <UrlSearchInput paramKey="name" label="Job name" placeholder="Filter by job name" />
          <UrlSelect
            paramKey="status"
            label="Status"
            options={[...STATUSES].map((s) => ({ value: s, label: s.charAt(0) + s.slice(1).toLowerCase() }))}
          />
        </FilterBar>
        <AdminTable
          columns={columns}
          rows={items}
          getRowKey={(r) => r.id}
          caption="Job runs"
          empty={<EmptyState title="No job runs match" description="Adjust the filters." />}
        />
        {nextCursor !== null && (
          <div>
            <Link
              href={`/admin/jobs?${loadMore.toString()}`}
              className="inline-flex h-9 items-center rounded-md border border-input bg-surface px-3 text-sm font-semibold text-foreground hover:bg-primary-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              Load more
            </Link>
          </div>
        )}
      </SettingsSection>

      <SettingsSection eyebrow="Schedules" title="Cron schedules" description="Static schedules from the module manifests. Dynamic (saved-search) schedules are generated at run time.">
        <AdminTable
          columns={[
            { key: "job", header: "Job", className: "font-mono", cell: (s) => s.job },
            { key: "cron", header: "Cron", className: "font-mono", cell: (s) => s.cron },
            { key: "tz", header: "Timezone", cell: (s) => s.timezone },
            { key: "desc", header: "Description", cell: (s) => s.description ?? "—" },
            ...(canRunNow
              ? [{ key: "run", header: "", align: "right" as const, cell: (s: (typeof schedules)[number]) => <RunNowButton jobName={s.job} input={s.input ?? {}} /> }]
              : []),
          ]}
          rows={schedules}
          getRowKey={(s) => s.id}
          caption="Cron schedules"
          empty={<EmptyState title="No schedules" />}
        />
      </SettingsSection>
    </div>
  );
}
