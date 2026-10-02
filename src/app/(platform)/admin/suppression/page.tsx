import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/patterns/page-header";
import { EmptyState, PermissionState } from "@/components/patterns/states";
import { Badge } from "@/components/ui/badge";
import { RelativeTime } from "@/components/ui/relative-time";
import { AdminTable, FilterBar, UrlSearchInput, UrlSelect, type AdminColumn } from "@/components/admin";
import { actorOf, canFromUser, requireUser } from "@/platform/auth";
import { listSuppressions } from "@/modules/acquisition/compliance";
import type { SuppressionReason, SuppressionType } from "@/contracts/common";

import { RemoveSuppressionButton, SuppressionToolbar } from "./_components/suppression-actions";

export const metadata: Metadata = { title: "Suppression · Admin" };

const TYPES = new Set<SuppressionType>(["EMAIL", "PHONE", "DOMAIN"]);
const REASONS = new Set<SuppressionReason>([
  "UNSUBSCRIBE",
  "BOUNCE",
  "COMPLAINT",
  "OBJECTION",
  "MANUAL",
  "DSR_DELETE",
  "IMPORT",
]);

interface Row {
  id: string;
  type: SuppressionType;
  value: string;
  isHashed: boolean;
  reason: SuppressionReason;
  source: string;
  note: string | null;
  createdAt: Date;
  removedAt: Date | null;
}

export default async function SuppressionPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  if (!canFromUser(user, "acquisition.suppression.read")) {
    return <PermissionState description="You don't have access to the suppression list." />;
  }

  const sp = await searchParams;
  const one = (v: string | string[] | undefined): string | undefined =>
    Array.isArray(v) ? v[0] : v;
  const typeParam = one(sp.type);
  const reasonParam = one(sp.reason);
  const q = (one(sp.q) ?? "").trim().toLowerCase();
  const cursor = one(sp.cursor);
  const includeRemoved = one(sp.removed) === "1";

  const type = typeParam !== undefined && TYPES.has(typeParam as SuppressionType)
    ? (typeParam as SuppressionType)
    : undefined;
  const reason = reasonParam !== undefined && REASONS.has(reasonParam as SuppressionReason)
    ? (reasonParam as SuppressionReason)
    : undefined;

  const actor = actorOf(user);
  const { items, nextCursor } = await listSuppressions(actor, {
    ...(type === undefined ? {} : { type }),
    ...(reason === undefined ? {} : { reason }),
    ...(cursor === undefined ? {} : { cursor }),
    includeRemoved,
    limit: 100,
  });

  // Value search is applied to the fetched window (see CR-18-GAP-SUPPRESSION-SEARCH).
  const rows: Row[] =
    q === "" ? items : items.filter((i) => !i.isHashed && i.value.toLowerCase().includes(q));

  const canRemove = canFromUser(user, "acquisition.suppression.remove");
  const canImport = canFromUser(user, "acquisition.suppression.import");

  const columns: AdminColumn<Row>[] = [
    {
      key: "value",
      header: "Value",
      className: "font-mono",
      cell: (r) =>
        r.isHashed ? <span className="text-muted">Hashed (data request)</span> : r.value,
    },
    { key: "type", header: "Type", cell: (r) => <Badge tone="neutral">{r.type}</Badge> },
    { key: "reason", header: "Reason", cell: (r) => r.reason.replace(/_/g, " ").toLowerCase() },
    { key: "source", header: "Source", cell: (r) => r.source.replace(/_/g, " ").toLowerCase() },
    {
      key: "added",
      header: "Added",
      cell: (r) => <RelativeTime value={r.createdAt} timezone={user.timezone} />,
    },
    {
      key: "status",
      header: "Status",
      cell: (r) =>
        r.removedAt !== null ? <Badge tone="warning">Removed</Badge> : <Badge tone="success">Active</Badge>,
    },
    ...(canRemove
      ? [
          {
            key: "actions",
            header: "",
            align: "right" as const,
            cell: (r: Row) =>
              r.removedAt === null ? <RemoveSuppressionButton id={r.id} value={r.value} /> : null,
          },
        ]
      : []),
  ];

  const loadMoreParams = new URLSearchParams();
  if (type !== undefined) loadMoreParams.set("type", type);
  if (reason !== undefined) loadMoreParams.set("reason", reason);
  if (includeRemoved) loadMoreParams.set("removed", "1");
  if (nextCursor !== null) loadMoreParams.set("cursor", nextCursor);

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Admin"
        title="Suppression list"
        description="Addresses, phone numbers and domains that must never be contacted. Suppressing one stops any active outreach at its company."
        actions={<SuppressionToolbar canImport={canImport} />}
      />

      <FilterBar>
        <UrlSearchInput label="Search by value" placeholder="Search by value (this page)" />
        <UrlSelect
          paramKey="type"
          label="Type"
          options={[
            { value: "EMAIL", label: "Email" },
            { value: "PHONE", label: "Phone" },
            { value: "DOMAIN", label: "Domain" },
          ]}
        />
        <UrlSelect
          paramKey="reason"
          label="Reason"
          options={[...REASONS].map((r) => ({ value: r, label: r.replace(/_/g, " ").toLowerCase() }))}
        />
      </FilterBar>

      <AdminTable
        columns={columns}
        rows={rows}
        getRowKey={(r) => r.id}
        caption="Suppressed contacts"
        empty={
          <EmptyState
            title="No suppressions match"
            description="Nothing here yet. Add one, or adjust the filters."
          />
        }
      />

      {nextCursor !== null && q === "" && (
        <div>
          <Link
            href={`/admin/suppression?${loadMoreParams.toString()}`}
            className="inline-flex h-9 items-center rounded-md border border-input bg-surface px-3 text-sm font-semibold text-foreground hover:bg-primary-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            Load more
          </Link>
        </div>
      )}
    </div>
  );
}
