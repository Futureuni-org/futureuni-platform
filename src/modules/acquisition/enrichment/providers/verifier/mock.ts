/**
 * Mock email verifier. Deterministic result per email so tests can predict statuses. Nigerian
 * webmail addresses and known throwaways still get realistic flags.
 */

import "server-only";

import type { EmailVerificationSchema, EmailVerifier } from "@/contracts/enrichment";
import type { z } from "zod";

type EmailVerification = z.infer<typeof EmailVerificationSchema>;

const WEBMAIL_DOMAINS = ["gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "icloud.com", "protonmail.com"];
const DISPOSABLE_DOMAINS = ["mailinator.com", "10minutemail.com", "guerrillamail.com"];
const ROLE_LOCALS = ["info", "hello", "sales", "support", "admin", "hi", "contact"];

export const mockVerifier: EmailVerifier = {
  id: "mock",
  verify(email) {
    const [local = "", domain = ""] = email.toLowerCase().split("@");
    const disposable = DISPOSABLE_DOMAINS.some((d) => domain === d);
    const webmail = WEBMAIL_DOMAINS.some((d) => domain === d);
    const roleBased = ROLE_LOCALS.some((r) => r === local);
    const invalid = disposable;
    const risky = webmail || roleBased;
    const status: EmailVerification["status"] = invalid ? "INVALID" : risky ? "RISKY" : "VALID";
    return Promise.resolve<EmailVerification>({
      email: email.toLowerCase(),
      status,
      flags: {
        catchAll: false,
        disposable,
        roleBased,
        webmail,
        mxFound: !invalid,
        smtpCheck: !invalid,
      },
      provider: "mock",
      checkedAt: new Date().toISOString(),
    });
  },
};
