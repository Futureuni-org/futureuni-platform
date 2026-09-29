import "server-only";

import { Section } from "@/components/patterns/section";
import { EmptyState } from "@/components/patterns/states";
import { RelativeTime } from "@/components/ui/relative-time";
import { listAudit } from "@/platform/audit-log";
import type { CurrentUser } from "@/platform/auth";

/**
 * Renders the last few audit-log entries where the user was the actor. Titles are the action
 * verb; details show target type/id in mono.
 */
export async function RecentActivity({ user }: { user: CurrentUser }) {
  const { items } = await listAudit({ actorId: user.id, limit: 8 });

  return (
    <Section eyebrow="Recent" title="Your activity">
      {items.length === 0 ? (
        <EmptyState title="Nothing yet" description="Your recent actions will land here." />
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {items.map((item) => (
            <li key={item.id} className="flex items-baseline justify-between gap-4 py-2 text-sm">
              <span className="flex flex-col gap-0.5">
                <span className="font-medium text-foreground">{item.action}</span>
                <span className="font-mono text-xs text-muted">
                  {item.targetType} · {item.targetId}
                </span>
              </span>
              <RelativeTime value={item.createdAt} timezone={user.timezone} className="text-xs" />
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
