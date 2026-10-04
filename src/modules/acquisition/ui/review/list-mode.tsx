"use client";

import { Button } from "@/components/ui";
import { MarketBadge } from "@/components/ui/market-badge";
import { AdminTable, type AdminColumn } from "@/components/admin";

import { channelLabel } from "./draft-text";
import { DraftFlags } from "./flags";
import type { ReviewDraft, ReviewPermissions } from "./view";

/** A compact table for managers who triage in bulk. Click a row to review it in focus mode. */
export function ListMode({
  drafts,
  permissions,
  onFocus,
  onApprove,
}: {
  drafts: ReviewDraft[];
  permissions: ReviewPermissions;
  onFocus: (messageId: string) => void;
  onApprove: (messageId: string) => void;
}): React.ReactElement {
  const columns: AdminColumn<ReviewDraft>[] = [
    {
      key: "company",
      header: "Company",
      cell: (d) => (
        <button
          type="button"
          onClick={() => { onFocus(d.messageId); }}
          className="text-left font-medium text-primary underline-offset-4 hover:underline"
        >
          {d.companyName}
        </button>
      ),
    },
    { key: "market", header: "Market", cell: (d) => <MarketBadge market={d.market} /> },
    { key: "channel", header: "Channel", cell: (d) => channelLabel(d.channel) },
    {
      key: "score",
      header: "Score",
      align: "right",
      className: "font-mono tabular-nums",
      cell: (d) => (d.score === null ? "—" : String(d.score)),
    },
    { key: "flags", header: "Flags", cell: (d) => <DraftFlags draft={d} /> },
    ...(permissions.canApprove
      ? [
          {
            key: "actions",
            header: "",
            align: "right" as const,
            cell: (d: ReviewDraft) => (
              <Button variant="ghost" size="sm" onClick={() => { onApprove(d.messageId); }}>
                Approve
              </Button>
            ),
          },
        ]
      : []),
  ];

  return (
    <AdminTable
      columns={columns}
      rows={drafts}
      getRowKey={(d) => d.messageId}
      caption="Review queue"
      empty={<span>Queue clear.</span>}
    />
  );
}
