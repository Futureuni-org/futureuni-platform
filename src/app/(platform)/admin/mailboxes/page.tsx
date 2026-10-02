import type { Metadata } from "next";

import { PageHeader } from "@/components/patterns/page-header";
import { EmptyState, PermissionState } from "@/components/patterns/states";
import { SettingsSection } from "@/components/admin";
import { canFromUser, requireUser } from "@/platform/auth";

import { listMailboxes, listSendingDomains } from "./mailboxes.repo";
import { AddMailboxDialog, DomainCard, MailboxCard } from "./_components/mailboxes-client";

export const metadata: Metadata = { title: "Mailboxes · Admin" };

const CHECKLIST = [
  "A dedicated outreach Google Workspace tenant with 2–3 secondary domains and an Internal OAuth app (gmail.send + gmail.readonly); refresh tokens stored in the credential vault.",
  "DNS per domain: SPF and DKIM (Google selector) with aligned DMARC, valid PTR, TLS and MX — run the DNS check above and fix every FAIL.",
  "Warm-up confirmed per mailbox (new tenants are capped at 500/day until $100 is paid); keep the manual ramp of 5 → 30–40/day.",
  "Verify Gmail preserves the List-Unsubscribe headers and that DKIM covers them (send a test and check “Show original”).",
  "Set the platform postal address (INV-4 blocks sending while empty) and keep acquisition.outreach.globalPause = true until the launch-checklist compliance gates pass.",
];

export default async function MailboxesPage() {
  const user = await requireUser();
  if (!canFromUser(user, "acquisition.mailbox.read")) {
    return <PermissionState description="Only administrators and managers can view mailboxes." />;
  }

  const [mailboxes, domains] = await Promise.all([listMailboxes(), listSendingDomains()]);
  const canManage = canFromUser(user, "acquisition.mailbox.manage");
  const canCheckDns = canFromUser(user, "acquisition.domain.checkDns");

  return (
    <div className="flex flex-col gap-10">
      <PageHeader eyebrow="Admin" title="Mailboxes and domains" description="Sending domains, their DNS health, and the outreach mailboxes with their warm-up." />

      <SettingsSection eyebrow="Domains" title="Sending domains" emphasized>
        {domains.length === 0 ? (
          <EmptyState title="No sending domains" description="Add a mailbox on a domain to register it." />
        ) : (
          <div className="flex flex-col gap-4">
            {domains.map((d) => (
              <DomainCard key={d.id} domain={d} timezone={user.timezone} canCheck={canCheckDns} />
            ))}
          </div>
        )}
      </SettingsSection>

      <SettingsSection
        eyebrow="Mailboxes"
        title="Outreach mailboxes"
        actions={canManage ? <AddMailboxDialog /> : undefined}
      >
        {mailboxes.length === 0 ? (
          <EmptyState title="No mailboxes" description="Add a mailbox to start warming it up." />
        ) : (
          <div className="flex flex-col gap-4">
            {mailboxes.map((m) => (
              <MailboxCard key={m.id} mailbox={m} canManage={canManage} />
            ))}
          </div>
        )}
      </SettingsSection>

      <SettingsSection eyebrow="Launch gate" title="Before you send for real" description="None of this is exercised while MOCKS=true. Work through it before switching off the global pause.">
        <ol className="flex flex-col gap-2">
          {CHECKLIST.map((item, i) => (
            <li key={i} className="flex gap-3 text-sm">
              <span className="font-mono text-muted">{i + 1}.</span>
              <span className="text-foreground">{item}</span>
            </li>
          ))}
        </ol>
      </SettingsSection>
    </div>
  );
}
