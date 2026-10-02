import { History } from "lucide-react";

import { RelativeTime } from "@/components/ui/relative-time";
import { cn } from "@/lib/cn";

export interface AuditTrailEntry {
  id: string;
  /** The dotted action, e.g. "platform.user.changeRole". */
  action: string;
  /** A human label for the actor (name or "System"). */
  actorLabel: string;
  at: Date | string;
  /** Optional one-line plain-language summary of what changed. */
  summary?: string;
}

/**
 * AuditTrailPanel — the recent audit entries for one object (a user, a credential, a DSR…).
 * Pure/presentational so it renders in server or client trees. The owning screen maps
 * `AuditListItem` rows to `AuditTrailEntry` and passes the viewer timezone.
 */
export function AuditTrailPanel({
  entries,
  timezone,
  emptyLabel = "No activity recorded yet.",
  className,
}: {
  entries: AuditTrailEntry[];
  timezone: string;
  emptyLabel?: string;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-muted">
        <History aria-hidden className="size-4" />
        Activity
      </div>
      {entries.length === 0 ? (
        <p className="text-sm text-muted">{emptyLabel}</p>
      ) : (
        <ol className="flex flex-col gap-3">
          {entries.map((entry) => (
            <li key={entry.id} className="reading-rule flex flex-col gap-0.5 pl-4">
              <p className="text-sm text-foreground">
                <span className="font-mono text-xs text-muted">{entry.action}</span>
                {entry.summary !== undefined && <> — {entry.summary}</>}
              </p>
              <p className="text-xs text-muted">
                {entry.actorLabel} · <RelativeTime value={entry.at} timezone={timezone} />
              </p>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
