"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Monitor } from "lucide-react";
import { toast } from "sonner";

import { SettingsSection } from "@/components/admin";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RelativeTime } from "@/components/ui/relative-time";
import { revokeOtherSessionsAction, revokeSessionAction } from "../actions";

export interface SessionRow {
  token: string;
  device: string;
  ip: string | null;
  lastActive: string;
  current: boolean;
}

export function SessionsList({ sessions, timezone }: { sessions: SessionRow[]; timezone: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const hasOthers = sessions.some((s) => !s.current);

  function revoke(token: string) {
    startTransition(async () => {
      const result = await revokeSessionAction(token);
      if (result.ok) {
        toast.success("Signed out that session.");
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  }

  function revokeOthers() {
    startTransition(async () => {
      const result = await revokeOtherSessionsAction();
      if (result.ok) {
        toast.success("Signed out all other sessions.");
        router.refresh();
      } else {
        toast.error(result.error.message);
      }
    });
  }

  return (
    <SettingsSection
      eyebrow="Security"
      title="Active sessions"
      description="Where you're signed in. Sign out any session you don't recognise."
      actions={
        hasOthers ? (
          <Button variant="secondary" size="sm" onClick={revokeOthers} loading={pending}>
            Sign out all other sessions
          </Button>
        ) : undefined
      }
    >
      <ul className="flex flex-col divide-y divide-border">
        {sessions.map((s) => (
          <li key={s.token} className="flex flex-wrap items-center justify-between gap-2 py-3">
            <div className="flex items-center gap-3">
              <Monitor aria-hidden className="size-4 text-muted" />
              <div className="flex flex-col gap-0.5">
                <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                  {s.device}
                  {s.current && <Badge tone="primary">This device</Badge>}
                </span>
                <span className="text-xs text-muted">
                  {s.ip ?? "Unknown IP"} · last active{" "}
                  <RelativeTime value={s.lastActive} timezone={timezone} />
                </span>
              </div>
            </div>
            {!s.current && (
              <Button
                variant="ghost"
                size="sm"
                className="text-danger"
                onClick={() => {
                  revoke(s.token);
                }}
                disabled={pending}
              >
                Sign out
              </Button>
            )}
          </li>
        ))}
      </ul>
    </SettingsSection>
  );
}
