import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { PageHeader } from "@/components/patterns/page-header";
import { Section } from "@/components/patterns/section";
import { StatRow, type Stat } from "@/components/patterns/stat-row";
import { SkeletonRows } from "@/components/patterns/states";
import { actorOf, canFromUser, requireUser } from "@/platform/auth";
import type { CurrentUser } from "@/platform/auth";
import { listJobRuns } from "@/platform/jobs";
import { listCredentialStatuses } from "@/platform/credentials";

import { countOpenDataSubjectRequests } from "./data-requests/data-requests.repo";

export const metadata: Metadata = { title: "Admin" };

const QUICK_LINKS: { href: string; label: string; description: string; action: Parameters<typeof canFromUser>[1] }[] = [
  { href: "/admin/users", label: "Users and invites", description: "Roles, invites, 2FA and sessions.", action: "platform.user.read" },
  { href: "/admin/team", label: "Team and capacity", description: "Service lines, capacity and load.", action: "platform.team.read" },
  { href: "/admin/integrations", label: "Integrations", description: "Provider credentials and tests.", action: "platform.credential.read" },
  { href: "/admin/mailboxes", label: "Mailboxes and domains", description: "Sending domains, DNS and warm-up.", action: "acquisition.mailbox.read" },
  { href: "/admin/suppression", label: "Suppression", description: "Addresses that must not be contacted.", action: "acquisition.suppression.read" },
  { href: "/admin/data-requests", label: "Data requests", description: "Export and deletion requests.", action: "acquisition.dsr.manage" },
  { href: "/admin/prompts", label: "Prompts", description: "AI prompt versions and evals.", action: "platform.prompt.read" },
  { href: "/admin/ai-usage", label: "AI usage", description: "Spend, budgets and model tiers.", action: "platform.aiUsage.read" },
  { href: "/admin/jobs", label: "Jobs", description: "Runs, retries and schedules.", action: "platform.job.read" },
  { href: "/admin/audit", label: "Audit log", description: "Every governed change.", action: "platform.audit.read" },
  { href: "/admin/platform", label: "Platform", description: "Settings, retention and modules.", action: "platform.setting.read" },
];

export default async function AdminHomePage() {
  const user = await requireUser();

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        eyebrow="Admin"
        title="Control room"
        description="What needs attention across the platform, and a way into every area you can manage."
      />

      <Suspense fallback={<SkeletonRows rows={2} />}>
        <StatusTiles user={user} />
      </Suspense>

      <Section eyebrow="Areas" title="Manage" emphasized>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {QUICK_LINKS.filter((l) => canFromUser(user, l.action)).map((l) => (
            <li key={l.href}>
              <Link
                href={l.href}
                className="group flex items-start justify-between gap-3 rounded-lg bg-zone px-4 py-3 transition-colors hover:bg-primary-soft"
              >
                <span className="flex flex-col gap-0.5">
                  <span className="text-sm font-semibold text-foreground">{l.label}</span>
                  <span className="text-sm text-muted">{l.description}</span>
                </span>
                <ArrowRight
                  aria-hidden
                  className="mt-0.5 size-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5"
                />
              </Link>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}

async function loadStatus(user: CurrentUser) {
  const actor = actorOf(user);
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

  return Promise.all([
    canFromUser(user, "platform.job.read")
      ? listJobRuns(actor, { status: "FAILED", from: since, limit: 100 }).then((r) => ({
          count: r.items.length,
          more: r.nextCursor !== null,
        }))
      : Promise.resolve(null),
    canFromUser(user, "platform.credential.read")
      ? listCredentialStatuses(actor).then((rows) => rows.filter((r) => r.status === "FAILING").length)
      : Promise.resolve(null),
    canFromUser(user, "acquisition.dsr.manage")
      ? countOpenDataSubjectRequests()
      : Promise.resolve(null),
  ]);
}

async function StatusTiles({ user }: { user: CurrentUser }) {
  const [failedJobs, failingIntegrations, openDsr] = await loadStatus(user);

  const stats: Stat[] = [];
  if (failedJobs !== null) {
    stats.push({
      id: "failed-jobs",
      label: "Failed jobs (24h)",
      value: failedJobs.more ? `${String(failedJobs.count)}+` : String(failedJobs.count),
      hint: "Across all schedules",
    });
  }
  if (failingIntegrations !== null) {
    stats.push({
      id: "integrations",
      label: "Integrations failing",
      value: String(failingIntegrations),
      hint: "Providers that last failed a test",
    });
  }
  if (openDsr !== null) {
    stats.push({ id: "open-dsr", label: "Open data requests", value: String(openDsr), hint: "Awaiting fulfilment" });
  }

  if (stats.length === 0) return null;
  return <StatRow stats={stats} />;
}
