"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { SettingsSection, ConfirmDialog, AdminTable, type AdminColumn } from "@/components/admin";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RelativeTime } from "@/components/ui/relative-time";
import { Select } from "@/components/admin";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ProfileDiff } from "@/modules/acquisition/profiles";
import { DiffView } from "./diff-view";
import { diffVersionsAction, rollbackAction } from "./actions";

export interface VersionRow {
  version: number;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  isActive: boolean;
  note: string | null;
  publishedAt: string | null;
  createdAt: string;
}

const STATUS_TONE = {
  DRAFT: "info",
  PUBLISHED: "success",
  ARCHIVED: "neutral",
} as const;

export function VersionHistory({
  slug,
  versions,
  canRollback,
  timezone,
}: {
  slug: string;
  versions: VersionRow[];
  canRollback: boolean;
  timezone: string;
}) {
  const router = useRouter();
  const [rollbackTarget, setRollbackTarget] = useState<number | null>(null);
  const comparable = versions.filter((v) => v.status !== "DRAFT");

  const columns: AdminColumn<VersionRow>[] = [
    {
      key: "version",
      header: "Version",
      className: "font-mono",
      cell: (v) => (
        <span className="flex items-center gap-2">
          v{v.version}
          {v.isActive && <Badge tone="primary">Active</Badge>}
        </span>
      ),
    },
    { key: "status", header: "Status", cell: (v) => <Badge tone={STATUS_TONE[v.status]}>{v.status}</Badge> },
    { key: "note", header: "Note", cell: (v) => v.note ?? "—" },
    {
      key: "when",
      header: "When",
      cell: (v) => <RelativeTime value={v.publishedAt ?? v.createdAt} timezone={timezone} />,
    },
    ...(canRollback
      ? [
          {
            key: "actions",
            header: "",
            align: "right" as const,
            cell: (v: VersionRow) =>
              !v.isActive && v.status !== "DRAFT" ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setRollbackTarget(v.version);
                  }}
                >
                  Roll back
                </Button>
              ) : null,
          },
        ]
      : []),
  ];

  return (
    <SettingsSection
      eyebrow="History"
      title="Version history"
      description="Every published version, newest first. Compare any two, or roll back to an earlier one."
      emphasized
      actions={comparable.length >= 2 ? <CompareVersions slug={slug} versions={comparable} /> : undefined}
    >
      <AdminTable
        columns={columns}
        rows={versions}
        getRowKey={(v) => String(v.version)}
        caption="Profile versions"
      />

      <ConfirmDialog
        open={rollbackTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRollbackTarget(null);
        }}
        title={`Roll back to version ${rollbackTarget === null ? "" : String(rollbackTarget)}`}
        description="This re-activates the chosen version as the active profile. It's audited and a note is required."
        confirmLabel="Roll back"
        requireReason
        reasonLabel="Note"
        onConfirm={async (reason) => {
          const target = rollbackTarget;
          if (target === null) {
            return { ok: false, error: { code: "VALIDATION_FAILED", message: "No version selected." } };
          }
          const result = await rollbackAction(slug, target, reason);
          if (result.ok) {
            toast.success(`Rolled back to version ${String(target)}.`);
            router.refresh();
          }
          return result;
        }}
      />
    </SettingsSection>
  );
}

function CompareVersions({ slug, versions }: { slug: string; versions: VersionRow[] }) {
  const [open, setOpen] = useState(false);
  const first = versions[0]?.version ?? 1;
  const second = versions[1]?.version ?? first;
  const [a, setA] = useState(second);
  const [b, setB] = useState(first);
  const [diff, setDiff] = useState<ProfileDiff | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function compare() {
    setLoading(true);
    setError(null);
    void (async () => {
      const result = await diffVersionsAction(slug, a, b);
      if (result.ok) {
        setDiff(result.data);
      } else {
        setError(result.error.message);
      }
      setLoading(false);
    })();
  }

  const options = versions.map((v) => ({ value: String(v.version), label: `v${String(v.version)}` }));

  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => {
          setOpen(true);
        }}
      >
        Compare versions
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] max-w-3xl overflow-auto">
          <DialogHeader>
            <DialogTitle>Compare versions</DialogTitle>
            <DialogDescription>See what changed between any two versions.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-xs font-medium text-muted">From</span>
              <Select
                aria-label="From version"
                value={String(a)}
                options={options}
                onChange={(e) => {
                  setA(Number(e.target.value));
                }}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-xs font-medium text-muted">To</span>
              <Select
                aria-label="To version"
                value={String(b)}
                options={options}
                onChange={(e) => {
                  setB(Number(e.target.value));
                }}
              />
            </label>
            <Button onClick={compare} loading={loading}>
              Compare
            </Button>
          </div>
          {error !== null && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
          {diff !== null && (
            <div className="rounded-md bg-surface p-1">
              <DiffView diff={diff} />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
