import "server-only";

import { AlertTriangle } from "lucide-react";

import { canFromUser } from "@/platform/auth";
import type { CurrentUser } from "@/platform/auth";
import { listCredentialStatuses } from "@/platform/credentials";
import { getSetting } from "@/platform/settings";

/**
 * Role-gated alerts row: failing credentials (ADMIN), paused mailboxes (Phase 12 will add its
 * signal here), and AI-budget warnings (ADMIN). Renders nothing if there's nothing to say.
 */
export async function Alerts({ user }: { user: CurrentUser }) {
  const canReadCredentials = canFromUser(user, "platform.credential.read");
  const canReadAiBudget = canFromUser(user, "platform.aiUsage.read");

  const [credentialStatuses, aiBudget] = await Promise.all([
    canReadCredentials
      ? listCredentialStatuses({ type: "USER", userId: user.id, role: user.role })
      : Promise.resolve([]),
    canReadAiBudget
      ? getSetting<{ platformDailyUsd: number }>("ai.budgets").catch(() => null)
      : Promise.resolve(null),
  ]);

  const alerts: { key: string; message: string }[] = [];
  const failing = credentialStatuses.filter((row) => row.status === "FAILING");
  if (failing.length > 0) {
    alerts.push({
      key: "credentials",
      message: `${String(failing.length)} integration credential${failing.length === 1 ? "" : "s"} failing.`,
    });
  }
  if (aiBudget !== null && aiBudget.platformDailyUsd <= 0) {
    alerts.push({
      key: "ai-budget",
      message: "AI daily budget is zero — every task will refuse to run.",
    });
  }

  if (alerts.length === 0) return null;
  return (
    <ul className="flex flex-col gap-2">
      {alerts.map((alert) => (
        <li
          key={alert.key}
          className="flex items-center gap-2 rounded-md border border-warning/40 bg-warning-soft px-3 py-2 text-sm text-warning"
        >
          <AlertTriangle aria-hidden className="size-4" />
          {alert.message}
        </li>
      ))}
    </ul>
  );
}
