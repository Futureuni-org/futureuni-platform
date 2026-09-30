/**
 * The contactability rule (Phase 9, `docs/contracts/enrichment.md` §3 rules 15–17).
 *
 * Applied in order (`getContactability`):
 *   1. Suppression → every channel BLOCKED.
 *   2. Consent record → overrides CONSENT_REQUIRED.
 *   3. Country rule + LEGAL_FORM_BUCKET → email verdict; UK unknown-form → REVIEW.
 *      Nigerian rows read `acquisition.compliance.ngDirectMarketingBasis`.
 *   4. Contact email status INVALID → BLOCKED.
 *   5. WhatsApp/LinkedIn: only ASSISTED_ALLOWED / BLOCKED (INV-7).
 *   6. Phone: CALL_TASK_ALLOWED / BLOCKED.
 *
 * `assertEmailAllowed(tx, { companyId, contactId })` throws `CONTACT_BLOCKED` unless
 * `email.status === "ALLOWED"`. Phase 12 calls it in the same code path as sending (INV-2).
 */

import "server-only";

import { LEGAL_FORM_BUCKET, type Contactability, type EmailVerdict } from "@/contracts/enrichment";
import type { LegalForm } from "@/contracts/common";
import { AppError } from "@/lib/errors";
import { findSuppressions } from "@/modules/acquisition/core";
import { db, type Tx } from "@/platform/db";
import { getSetting } from "@/platform/settings";

import { getCountryRule } from "./country-rules";

export interface ContactabilityInput {
  companyId: string;
  contactId?: string;
}

export async function getContactability(tx: Tx | null, input: ContactabilityInput): Promise<Contactability> {
  const client = tx ?? db;
  const company = await client.company.findUnique({
    where: { id: input.companyId },
    select: { id: true, country: true, normalizedDomain: true, legalForm: true, primaryPhone: true },
  });
  if (company === null) throw new AppError("NOT_FOUND", "Company not found for contactability.");

  const contact = input.contactId !== undefined
    ? await client.contact.findUnique({
        where: { id: input.contactId },
        select: { id: true, email: true, emailStatus: true, phone: true, whatsappStatus: true, linkedinUrl: true },
      })
    : null;

  const now = new Date().toISOString();

  // 1. Suppression check.
  const suppressed = await findSuppressions(tx, {
    ...(contact?.email !== null && contact?.email !== undefined ? { email: contact.email } : {}),
    ...(contact?.phone !== null && contact?.phone !== undefined ? { phone: contact.phone } : {}),
    ...(company.normalizedDomain !== null ? { domain: company.normalizedDomain } : {}),
  });
  if (suppressed.length > 0) {
    return blocked(now, "Suppressed", `suppressed:${suppressed[0]?.type ?? "EMAIL"}`);
  }

  // 2. Consent record.
  const consent = contact?.email !== null && contact?.email !== undefined
    ? await client.consentRecord.findFirst({
        where: {
          OR: [
            { email: contact.email, revokedAt: null },
            { contactId: contact.id, revokedAt: null },
          ],
        },
        select: { id: true },
      })
    : null;

  // 3. Country rule + legal form bucket.
  const rule = getCountryRule(company.country);
  const legalForm: LegalForm = company.legalForm;
  const bucket = LEGAL_FORM_BUCKET[legalForm];
  const rawEmailStatus = rule.coldEmail[bucket];
  let emailStatus: EmailVerdict = rawEmailStatus === "PROHIBITED" ? "BLOCKED" : rawEmailStatus;
  let ruleId: string | undefined = rawEmailStatus === "PROHIBITED" ? `${rule.country}.prohibited` : `${rule.country}.${bucket}`;
  let reason = `${rule.country} ${bucket}: ${rule.regime}`;

  // Nigerian override from setting.
  if (rule.country === "NG") {
    let basis: "PENDING_LEGAL_REVIEW" | "LEGITIMATE_INTEREST_CONFIRMED" | "CONSENT_ONLY" = "PENDING_LEGAL_REVIEW";
    try {
      basis = await getSetting<"PENDING_LEGAL_REVIEW" | "LEGITIMATE_INTEREST_CONFIRMED" | "CONSENT_ONLY">(
        "acquisition.compliance.ngDirectMarketingBasis",
      );
    } catch {
      // Setting not registered yet (before manifest wiring); fall back to the safe default.
    }
    if (basis === "LEGITIMATE_INTEREST_CONFIRMED" && bucket === "incorporated") {
      emailStatus = "ALLOWED";
      ruleId = "NG.incorporated.legitimate_interest";
      reason = "NG: incorporated body under confirmed LIA (NDPA Art. 26).";
    } else if (basis === "CONSENT_ONLY") {
      emailStatus = "CONSENT_REQUIRED";
      ruleId = "NG.consent_only";
      reason = "NG: consent required by policy.";
    } else {
      emailStatus = "REVIEW";
      ruleId = "NG.pending_legal_review";
      reason = "NG: awaiting legal review of direct-marketing basis.";
    }
  }

  // UK: unknown form → REVIEW (INV-6).
  if (rule.country === "GB" && bucket === "unknownForm") {
    emailStatus = "REVIEW";
    ruleId = "GB.unknownForm";
    reason = "UK: legal form unknown; email held for review (INV-6).";
  }

  // Consent overrides CONSENT_REQUIRED.
  if (emailStatus === "CONSENT_REQUIRED" && consent !== null) {
    emailStatus = "ALLOWED";
    ruleId = `${ruleId}+consent`;
    reason = `${reason} (consent recorded)`;
  }

  // 4. Contact email status INVALID → BLOCKED.
  if (contact?.emailStatus === "INVALID") {
    emailStatus = "BLOCKED";
    ruleId = "email.invalid";
    reason = "Contact email marked INVALID by the verifier.";
  }

  const whatsappOk = contact?.whatsappStatus === "CONFIRMED" || contact?.whatsappStatus === "LIKELY";
  const linkedinOk = contact?.linkedinUrl != null;
  const phoneOk = (contact?.phone ?? company.primaryPhone) !== null;

  return {
    email: { status: emailStatus, reason, ruleId },
    whatsapp: {
      status: whatsappOk ? "ASSISTED_ALLOWED" : "BLOCKED",
      reason: whatsappOk ? "Assisted only; a human sends it (INV-7)." : "No WhatsApp signal.",
    },
    linkedin: {
      status: linkedinOk ? "ASSISTED_ALLOWED" : "BLOCKED",
      reason: linkedinOk ? "LinkedIn company page found; assisted only." : "No LinkedIn URL.",
    },
    phone: {
      status: phoneOk ? "CALL_TASK_ALLOWED" : "BLOCKED",
      reason: phoneOk ? "Business phone available." : "No phone number.",
    },
    lawfulBasis: emailStatus === "ALLOWED" && consent === null ? "LEGITIMATE_INTEREST_B2B" : "CONSENT",
    evaluatedAt: now,
  };
}

export async function assertEmailAllowed(tx: Tx | null, input: { companyId: string; contactId: string }): Promise<void> {
  const verdict = await getContactability(tx, input);
  if (verdict.email.status !== "ALLOWED") {
    throw new AppError("CONTACT_BLOCKED", `Email is ${verdict.email.status}: ${verdict.email.reason}`, {
      details: verdict.email.ruleId === undefined ? {} : { ruleId: verdict.email.ruleId },
    });
  }
}

function blocked(now: string, reason: string, ruleId: string): Contactability {
  return {
    email: { status: "BLOCKED", reason, ruleId },
    whatsapp: { status: "BLOCKED", reason },
    linkedin: { status: "BLOCKED", reason },
    phone: { status: "BLOCKED", reason },
    lawfulBasis: "LEGITIMATE_INTEREST_B2B",
    evaluatedAt: now,
  };
}
