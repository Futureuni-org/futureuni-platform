/**
 * Builds the flattened `ScoringFacts` the engine evaluates, from already-loaded rows. Pure: no I/O,
 * so the reads (which the repo does) stay separate and the mapping stays testable. See
 * docs/contracts/service-line-profile.md §"ScoringFacts".
 */

import type { Market } from "@/contracts/common";
import type { Contactability } from "@/contracts/enrichment";
import type { ScoringFacts } from "@/contracts/service-line-profile";
import type { AuditFinding, Company, Contact, Signal } from "@/platform/db";

export interface BuildScoringFactsInput {
  lead: { market: Market; country: string | null };
  company: Pick<
    Company,
    "legalForm" | "sizeRange" | "websiteKind" | "website" | "industry" | "isActiveClient" | "copyrightYear"
  >;
  /** The lead's primary contact, or null when none was found. */
  primaryContact: Pick<
    Contact,
    "emailStatus" | "emailType" | "whatsappStatus" | "seniority"
  > | null;
  /** All signals for the lead's line (the facts expose signalType + count). */
  signals: Pick<Signal, "id" | "signalType">[];
  /** All findings for the lead; dismissed ones are filtered out here (they can never score, INV-18). */
  findings: Pick<AuditFinding, "id" | "checkId" | "severity" | "pitchable" | "dismissedAt">[];
  contactability: Contactability;
}

/** True when the lead has any non-automatic channel open (WhatsApp, LinkedIn or phone). */
export function hasAssistedChannel(c: Contactability): boolean {
  return (
    c.whatsapp.status !== "BLOCKED" ||
    c.linkedin.status !== "BLOCKED" ||
    c.phone.status !== "BLOCKED"
  );
}

export function buildScoringFacts(input: BuildScoringFactsInput): ScoringFacts {
  const { company, primaryContact, contactability } = input;
  return {
    market: input.lead.market,
    country: input.lead.country,
    company: {
      legalForm: company.legalForm,
      sizeRange: company.sizeRange,
      websiteKind: company.websiteKind,
      // "Has a website" means an actual own-site URL was found (social-only leaves this false).
      hasWebsite: typeof company.website === "string" && company.website.trim().length > 0,
      industry: company.industry,
      isActiveClient: company.isActiveClient,
      copyrightYear: company.copyrightYear,
    },
    contact: {
      primary: {
        exists: primaryContact !== null,
        emailStatus: primaryContact?.emailStatus ?? null,
        emailType: primaryContact?.emailType ?? null,
        whatsappStatus: primaryContact?.whatsappStatus ?? null,
        seniority: primaryContact?.seniority ?? null,
      },
    },
    contactability: {
      email: contactability.email.status,
      hasAssistedChannel: hasAssistedChannel(contactability),
    },
    signals: input.signals.map((s) => ({ id: s.id, signalType: s.signalType })),
    findings: input.findings
      .filter((f) => f.dismissedAt === null)
      .map((f) => ({
        id: f.id,
        checkId: f.checkId,
        severity: f.severity,
        pitchable: f.pitchable,
        dismissed: false as const,
      })),
  };
}
