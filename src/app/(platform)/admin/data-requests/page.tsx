import type { Metadata } from "next";

import { PageHeader } from "@/components/patterns/page-header";
import { EmptyState, PermissionState } from "@/components/patterns/states";
import { Badge } from "@/components/ui/badge";
import { RelativeTime } from "@/components/ui/relative-time";
import { Separator } from "@/components/ui/separator";
import { AuditTrailPanel, type AuditTrailEntry } from "@/components/admin";
import { canFromUser, requireUser } from "@/platform/auth";
import { getAuditForTarget } from "@/platform/audit-log";
import type { DsrStatus } from "@/contracts/common";

import { listDataSubjectRequests } from "./data-requests.repo";
import {
  CreateDsrDialog,
  FulfilDeleteButton,
  FulfilExportButton,
} from "./_components/dsr-actions";

export const metadata: Metadata = { title: "Data requests · Admin" };

const STATUS_TONE: Record<DsrStatus, "info" | "warning" | "success" | "danger"> = {
  OPEN: "info",
  IN_PROGRESS: "warning",
  COMPLETED: "success",
  REJECTED: "danger",
};

export default async function DataRequestsPage() {
  const user = await requireUser();
  if (!canFromUser(user, "acquisition.dsr.manage")) {
    return <PermissionState description="Only administrators can manage data-subject requests." />;
  }

  const requests = await listDataSubjectRequests(50);
  const trails = await Promise.all(
    requests.map(async (r) => {
      const entries = await getAuditForTarget("DataSubjectRequest", r.id);
      return [r.id, entries] as const;
    }),
  );
  const trailMap = new Map(trails);

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Admin"
        title="Data requests"
        description="Record and fulfil data-subject export and deletion requests (INV-10). Deletions anonymise personal data and add a hashed suppression."
        actions={<CreateDsrDialog />}
      />

      {requests.length === 0 ? (
        <EmptyState
          title="No data requests yet"
          description="When someone asks to see or delete the data held about them, record it here."
        />
      ) : (
        <ul className="flex flex-col gap-8">
          {requests.map((r) => {
            const subject = r.subjectEmail ?? r.subjectPhone ?? "—";
            const entries: AuditTrailEntry[] = (trailMap.get(r.id) ?? []).map((e) => ({
              id: e.id,
              action: e.action,
              actorLabel: e.actorLabel ?? "System",
              at: e.createdAt,
            }));
            return (
              <li key={r.id} className="flex flex-col gap-4">
                <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
                  <div className="flex flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm text-foreground">{subject}</span>
                      <Badge tone={r.type === "DELETE" ? "danger" : "info"}>{r.type}</Badge>
                      <Badge tone={STATUS_TONE[r.status]}>{r.status.replace(/_/g, " ")}</Badge>
                    </div>
                    <p className="text-sm text-muted">
                      Requested by {r.requestedBy} ·{" "}
                      <RelativeTime value={r.createdAt} timezone={user.timezone} />
                      {r.fulfilledAt !== null && (
                        <>
                          {" · fulfilled "}
                          <RelativeTime value={r.fulfilledAt} timezone={user.timezone} />
                        </>
                      )}
                    </p>
                    {r.notes !== null && r.notes !== "" && (
                      <p className="max-w-prose text-sm text-muted">{r.notes}</p>
                    )}
                  </div>
                  {r.status === "OPEN" && (
                    <div className="flex shrink-0 gap-2">
                      {r.type === "EXPORT" ? (
                        <FulfilExportButton id={r.id} />
                      ) : (
                        <FulfilDeleteButton id={r.id} subject={subject} />
                      )}
                    </div>
                  )}
                </div>
                <AuditTrailPanel entries={entries} timezone={user.timezone} />
                <Separator />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
