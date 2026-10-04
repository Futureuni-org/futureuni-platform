import "server-only";

import type { ReactNode } from "react";
import { parsePhoneNumberFromString } from "libphonenumber-js";
import { MessageCircle, Star } from "lucide-react";

import type { SelectOption } from "@/components/admin";
import type { CompanySizeRange, EmailStatus, WhatsAppStatus } from "@/contracts/common";

import { ContactabilityList } from "./contactability-list";
import type { DetailCapabilities } from "./detail-types";
import { enumLabel, formatDate, formatDateTime, LEGAL_FORM_LABEL } from "./format";
import type { LeadContactView, LeadEnrolmentView, LeadHeaderView } from "./lead-detail.repo";
import { NextActionControl, OwnerControl, SetPrimaryButton } from "./side-rail-controls";
import { ToneBadge, type Tone } from "./tone-badge";

/**
 * The lead-detail side rail: owner, next action, key facts, contacts, the contactability verdict
 * and the enrolment status. Server-rendered; only the three interactive controls are client code.
 */

const SIZE_LABEL: Record<CompanySizeRange, string> = {
  SOLO: "Solo",
  SIZE_2_10: "2–10 people",
  SIZE_11_50: "11–50 people",
  SIZE_51_200: "51–200 people",
  SIZE_201_1000: "201–1,000 people",
  SIZE_1000_PLUS: "Over 1,000 people",
  UNKNOWN: "Unknown",
};

const EMAIL_STATUS: Record<EmailStatus, { label: string; tone: Tone }> = {
  VALID: { label: "Verified", tone: "success" },
  RISKY: { label: "Risky", tone: "warning" },
  INVALID: { label: "Invalid", tone: "danger" },
  UNVERIFIED: { label: "Unverified", tone: "neutral" },
  UNKNOWN: { label: "Unverified", tone: "neutral" },
};

const WHATSAPP_STATUS: Partial<Record<WhatsAppStatus, { label: string; tone: Tone }>> = {
  CONFIRMED: { label: "WhatsApp confirmed", tone: "success" },
  LIKELY: { label: "WhatsApp likely", tone: "info" },
};

function formatPhone(e164: string): string {
  return parsePhoneNumberFromString(e164)?.formatInternational() ?? e164;
}

function RailBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-xs font-semibold tracking-[0.08em] text-muted uppercase">{title}</h2>
      {children}
    </section>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <dt className="shrink-0 text-muted">{label}</dt>
      <dd className="min-w-0 text-right break-words text-foreground">{children}</dd>
    </div>
  );
}

function ContactRow({
  contact,
  leadId,
  canUpdate,
}: {
  contact: LeadContactView;
  leadId: string;
  canUpdate: boolean;
}) {
  const name = contact.name ?? "Unnamed contact";
  const email = EMAIL_STATUS[contact.emailStatus];
  const whatsapp = WHATSAPP_STATUS[contact.whatsappStatus];

  return (
    <li className="flex flex-col gap-1.5 text-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 font-medium break-words text-heading">
          {name}
          {contact.isPrimary && (
            <ToneBadge tone="primary" icon={Star} className="ml-2 align-middle">
              Primary
            </ToneBadge>
          )}
        </span>
        {canUpdate && !contact.isPrimary && (
          <SetPrimaryButton leadId={leadId} contactId={contact.id} contactName={name} />
        )}
      </div>
      {contact.role !== null && <span className="break-words text-muted">{contact.role}</span>}
      {contact.email !== null && (
        <span className="flex flex-wrap items-center gap-2">
          <a href={`mailto:${contact.email}`} className="break-all text-primary hover:underline">
            {contact.email}
          </a>
          <ToneBadge tone={email.tone}>{email.label}</ToneBadge>
        </span>
      )}
      {contact.phone !== null && (
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-foreground tabular-nums">
            {formatPhone(contact.phone)}
          </span>
          {whatsapp !== undefined && (
            <ToneBadge tone={whatsapp.tone} icon={MessageCircle}>
              {whatsapp.label}
            </ToneBadge>
          )}
        </span>
      )}
      {contact.linkedinUrl !== null && (
        <a
          href={contact.linkedinUrl}
          target="_blank"
          rel="noreferrer noopener"
          className="text-primary hover:underline"
        >
          LinkedIn profile
        </a>
      )}
    </li>
  );
}

function channelVerdicts(header: LeadHeaderView) {
  const verdict = header.contactability;
  if (verdict === null) return [];
  return [
    { name: "Email", status: verdict.email.status, reason: verdict.email.reason },
    { name: "WhatsApp", status: verdict.whatsapp.status, reason: verdict.whatsapp.reason },
    { name: "LinkedIn", status: verdict.linkedin.status, reason: verdict.linkedin.reason },
    { name: "Phone", status: verdict.phone.status, reason: verdict.phone.reason },
  ];
}

function enrolmentText(enrolment: LeadEnrolmentView | null, timezone: string): string {
  if (enrolment === null) return "Not enrolled in a sequence.";
  switch (enrolment.status) {
    case "ACTIVE":
      return "Active: the sequence is running.";
    case "PAUSED": {
      const until =
        enrolment.pausedUntil === null
          ? ""
          : ` until ${formatDateTime(enrolment.pausedUntil.toISOString(), timezone)}`;
      const reason =
        enrolment.pauseReason === null
          ? ""
          : ` (${enumLabel(enrolment.pauseReason).toLowerCase()})`;
      return `Paused${until}${reason}.`;
    }
    case "STOPPED":
      return enrolment.stoppedReason === null
        ? "Stopped."
        : `Stopped: ${enumLabel(enrolment.stoppedReason).toLowerCase()}.`;
    case "COMPLETED":
      return "Completed: every step was sent.";
  }
}

export function LeadSideRail({
  header,
  capabilities,
  owners,
  timezone,
  now,
}: {
  header: LeadHeaderView;
  capabilities: DetailCapabilities;
  owners: SelectOption[];
  timezone: string;
  now: Date;
}) {
  const { company } = header;
  const overdue = header.nextActionAt !== null && header.nextActionAt.getTime() < now.getTime();

  return (
    <>
      <RailBlock title="Owner">
        <OwnerControl
          leadId={header.id}
          owner={header.owner}
          owners={owners}
          canAssign={capabilities.assign}
        />
      </RailBlock>

      <RailBlock title="Next action">
        <NextActionControl
          leadId={header.id}
          at={header.nextActionAt === null ? null : header.nextActionAt.toISOString()}
          note={header.nextActionNote}
          overdue={overdue}
          timezone={timezone}
          canEdit={capabilities.update}
        />
      </RailBlock>

      <RailBlock title="Key facts">
        <dl className="flex flex-col gap-2">
          <Fact label="Legal form">{LEGAL_FORM_LABEL[company.legalForm]}</Fact>
          <Fact label="Size">{SIZE_LABEL[company.sizeRange]}</Fact>
          <Fact label="Industry">{company.industry ?? "Unknown"}</Fact>
          <Fact label="First source">
            {company.firstSourceUrl === null ? (
              company.firstSource
            ) : (
              <a
                href={company.firstSourceUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="text-primary hover:underline"
              >
                {company.firstSource}
              </a>
            )}
          </Fact>
          <Fact label="Created">{formatDate(header.createdAt.toISOString(), timezone)}</Fact>
        </dl>
      </RailBlock>

      <RailBlock title="Contacts">
        {header.contacts.length === 0 ? (
          <p className="text-sm text-muted">No contacts found yet. Enrichment adds them.</p>
        ) : (
          <ul className="flex flex-col gap-5">
            {header.contacts.map((contact) => (
              <ContactRow
                key={contact.id}
                contact={contact}
                leadId={header.id}
                canUpdate={capabilities.update}
              />
            ))}
          </ul>
        )}
      </RailBlock>

      <RailBlock title="Contactability">
        <ContactabilityList channels={channelVerdicts(header)} />
      </RailBlock>

      <RailBlock title="Outreach sequence">
        <p className="text-sm text-foreground">{enrolmentText(header.enrolment, timezone)}</p>
      </RailBlock>
    </>
  );
}
