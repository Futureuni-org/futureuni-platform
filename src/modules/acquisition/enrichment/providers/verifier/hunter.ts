/**
 * Hunter email verifier (Phase 9, ADR-020).
 *
 * A `451 claimed_email` response means the person invoked their GDPR rights against Hunter's
 * processing of their address; contract §3 rule 13a says we surface it as
 * `{ status: "INVALID", flags.providerStatus: "claimed_email" }` **and** immediately add an
 * `EMAIL` suppression (reason `OBJECTION`, source `PROVIDER_SIGNAL`).
 */

import "server-only";

import type { EmailVerificationSchema, EmailVerifier } from "@/contracts/enrichment";
import type { z } from "zod";

import { AppError } from "@/lib/errors";
import { resolveProviderKey } from "@/platform/credentials";
import { safeFetch } from "@/platform/http";

type EmailVerification = z.infer<typeof EmailVerificationSchema>;

const BASE = "https://api.hunter.io/v2/email-verifier";

interface Response {
  data?: {
    status?: string;
    result?: string;
    accept_all?: boolean;
    disposable?: boolean;
    role?: boolean;
    webmail?: boolean;
    mx_records?: boolean;
    smtp_check?: boolean;
  };
  errors?: { code?: number; id?: string; details?: string }[];
}

export const hunterVerifier: EmailVerifier = {
  id: "hunter",
  async verify(email) {
    const apiKey = await resolveProviderKey("hunter");
    if (apiKey === null) throw new AppError("PROVIDER_ERROR", "Hunter API key not configured.");
    const url = `${BASE}?email=${encodeURIComponent(email)}&api_key=${encodeURIComponent(apiKey)}`;
    const res = await safeFetch(url, { respectRobots: false, timeoutMs: 15_000 });
    if (res.status === 451) {
      // Claimed-email / GDPR objection.
      const now = new Date().toISOString();
      // Add suppression as a side-effect of the verify (§3 rule 13a). Dynamic import to avoid
      // a cycle at module load time.
      const { addSuppression } = await import("@/modules/acquisition/compliance/suppression");
      await addSuppression(
        { type: "SYSTEM", job: "acquisition.enrichment.verifier" },
        {
          type: "EMAIL",
          value: email,
          reason: "OBJECTION",
          source: "PROVIDER_SIGNAL",
          note: "hunter:claimed_email",
        },
      );
      return {
        email: email.toLowerCase(),
        status: "INVALID",
        flags: {
          catchAll: false,
          disposable: false,
          roleBased: false,
          webmail: false,
          providerStatus: "claimed_email",
        },
        provider: "hunter",
        checkedAt: now,
      };
    }
    if (!res.ok || res.body === null) {
      return {
        email: email.toLowerCase(),
        status: "UNKNOWN",
        flags: {
          catchAll: false,
          disposable: false,
          roleBased: false,
          webmail: false,
          providerStatus: `http_${String(res.status)}`,
        },
        provider: "hunter",
        checkedAt: new Date().toISOString(),
      };
    }
    const body = safeJson(res.body) as Response | null;
    const data = body?.data;
    const status = mapStatus(data?.result ?? data?.status);
    const verification: EmailVerification = {
      email: email.toLowerCase(),
      status,
      flags: {
        catchAll: data?.accept_all ?? false,
        disposable: data?.disposable ?? false,
        roleBased: data?.role ?? false,
        webmail: data?.webmail ?? false,
        ...(data?.mx_records === undefined ? {} : { mxFound: data.mx_records }),
        ...(data?.smtp_check === undefined ? {} : { smtpCheck: data.smtp_check }),
        ...(data?.result === undefined ? {} : { providerStatus: data.result }),
      },
      provider: "hunter",
      checkedAt: new Date().toISOString(),
    };
    return verification;
  },
};

function mapStatus(raw: string | undefined): EmailVerification["status"] {
  switch (raw) {
    case "deliverable":
      return "VALID";
    case "risky":
      return "RISKY";
    case "undeliverable":
      return "INVALID";
    default:
      return "UNKNOWN";
  }
}

function safeJson(body: string): unknown {
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}
