import "server-only";

/**
 * Selects the EmailSender from `MOCKS` and `OUTREACH_SENDER` (ADR-005, ADR-016). The choice is made
 * here, never with an `if` in feature code: the send path always calls `getEmailSender()`.
 */

import { env } from "@/env";
import type { EmailSender } from "@/contracts/outreach-channel";

import { gmailApiEmailSender } from "./gmail-api";
import { mockEmailSender } from "./mock";
import { smtpEmailSender } from "./smtp";

export function getEmailSender(): EmailSender {
  if (env.MOCKS) return mockEmailSender;
  switch (env.OUTREACH_SENDER) {
    case "gmail-api":
      return gmailApiEmailSender;
    case "smtp":
      return smtpEmailSender;
    case "mock":
      return mockEmailSender;
  }
}

export { mockEmailSender } from "./mock";
export { configureMockSender, getMockSends, getMockSend, resetMockSender } from "./mock";
