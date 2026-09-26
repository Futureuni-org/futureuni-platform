/**
 * Suppressions, consent and data-subject requests (data-model §10.7). Values are stored
 * normalised; the DSR deletion's suppression holds only the keyed hash of the address, which the
 * seeder computes with the same function the product uses (`hashValueOf`).
 */

import type { Prisma } from "@/platform/db";

import { KEY_LEADS } from "../data/leads";
import { seedId } from "../lib/ids";
import { ago } from "../lib/time";

import {
  byLead,
  contactIdsByCompany,
  lastTime,
  timeOf,
  userId,
  type LeadInfo,
  type Row,
} from "./base";

export interface SuppressionRow extends Row<Prisma.SuppressionUncheckedCreateInput> {
  /** When set, the seeder stores the keyed hash of this normalised address as `value`. */
  hashValueOf?: string;
}

export interface DataSubjectRequestRow extends Row<Prisma.DataSubjectRequestUncheckedCreateInput> {
  /** When set, the seeder stores the keyed hash of this address as `subjectEmail`. */
  hashSubjectEmailOf?: string;
}

export interface ComplianceWorld {
  suppressions: SuppressionRow[];
  consentRecords: Row<Prisma.ConsentRecordUncheckedCreateInput>[];
  dataSubjectRequests: DataSubjectRequestRow[];
}

/** The person whose data a completed DSR removed (the anonymised contact at company 42). */
export const DELETED_SUBJECT_EMAIL = "j.hart@cartervale.example";

function contactOf(lead: LeadInfo): { email?: string; phone?: string } {
  const contact = lead.contactIndex === null ? undefined : lead.company.contacts[lead.contactIndex];
  return {
    ...(contact?.email === undefined ? {} : { email: contact.email }),
    ...(contact?.phone === undefined ? {} : { phone: contact.phone }),
  };
}

export function buildCompliance(now: Date, leads: readonly LeadInfo[]): ComplianceWorld {
  const admin = userId("admin");
  const unsubscribed = byLead(leads, KEY_LEADS.oneClickUnsubscribe);
  const phoneOptOut = byLead(leads, KEY_LEADS.whatsappUnsubscribe);
  const domainBlocked = byLead(leads, KEY_LEADS.domainSuppressed);
  const bounced = byLead(leads, KEY_LEADS.hardBounce);
  const required = (value: string | undefined, what: string): string => {
    if (value === undefined) throw new Error(`Seed compliance data is missing ${what}.`);
    return value;
  };

  const suppressions: SuppressionRow[] = [
    {
      id: seedId("supp", 1),
      type: "EMAIL",
      value: required(contactOf(unsubscribed).email, "the unsubscribed email"),
      reason: "UNSUBSCRIBE",
      source: "ONE_CLICK",
      createdAt: lastTime(unsubscribed),
    },
    {
      id: seedId("supp", 2),
      type: "PHONE",
      value: required(contactOf(phoneOptOut).phone, "the opted-out phone"),
      reason: "MANUAL",
      source: "MANUAL",
      note: "Asked on WhatsApp not to be contacted again.",
      createdById: admin,
      createdAt: lastTime(phoneOptOut),
    },
    {
      id: seedId("supp", 3),
      type: "DOMAIN",
      value: required(domainBlocked.company.domain ?? undefined, "the suppressed domain"),
      reason: "MANUAL",
      source: "MANUAL",
      note: "The owner asked by phone that nobody at the business is contacted.",
      createdById: admin,
      createdAt: lastTime(domainBlocked),
    },
    {
      id: seedId("supp", 4),
      type: "EMAIL",
      value: required(contactOf(bounced).email, "the bounced email"),
      reason: "BOUNCE",
      source: "BOUNCE",
      createdAt: new Date((timeOf(bounced, "CONTACTED") ?? now).getTime() + 180_000),
    },
    {
      id: seedId("supp", 5),
      type: "EMAIL",
      value: "",
      hashValueOf: DELETED_SUBJECT_EMAIL,
      isHashed: true,
      reason: "DSR_DELETE",
      source: "DSR",
      note: "Deletion request fulfilled; only the keyed hash is kept so the address is never contacted again.",
      createdById: admin,
      createdAt: ago(now, { days: 20 }),
    },
  ];

  // The UK sole trader asked for details by email on a call, before the first email (INV-6).
  const consenting = byLead(leads, 70);
  const consentContact = contactIdsByCompany().get(consenting.company.n)?.[0];
  const consentAt = timeOf(consenting, "APPROVED") ?? consenting.createdAt;
  const consentRecords: ComplianceWorld["consentRecords"] = [
    {
      id: seedId("cons", 1),
      contactId: consentContact ?? null,
      email: contactOf(consenting).email ?? null,
      scope: "EMAIL_OUTREACH",
      method: "VERBAL",
      evidence: `On a call on ${consentAt.toISOString().slice(0, 10)} he asked us to email the details and prices.`,
      recordedById: consenting.ownerId,
      recordedAt: consentAt,
      createdAt: consentAt,
    },
  ];

  const dataSubjectRequests: ComplianceWorld["dataSubjectRequests"] = [
    {
      id: seedId("dsrq", 1),
      type: "EXPORT",
      status: "OPEN",
      subjectEmail: "james@harlowlettings.example",
      requestedBy: "Email to the privacy inbox",
      notes: "Asked for a copy of everything we hold about him.",
      createdById: admin,
      createdAt: ago(now, { days: 3 }),
    },
    {
      id: seedId("dsrq", 2),
      type: "DELETE",
      status: "COMPLETED",
      // Replaced by its keyed hash once the deletion is fulfilled.
      subjectEmail: "",
      hashSubjectEmailOf: DELETED_SUBJECT_EMAIL,
      requestedBy: "Reply to an outreach email",
      notes: "Contact anonymised and the address suppressed by hash.",
      createdById: admin,
      fulfilledById: admin,
      fulfilledAt: ago(now, { days: 20 }),
      resultSummary: { contactsAnonymized: 1, suppressionsAdded: 1, messagesRedacted: 0 },
      createdAt: ago(now, { days: 24 }),
    },
  ];

  return { suppressions, consentRecords, dataSubjectRequests };
}
