import "server-only";

/**
 * Selects the inbound reply source. The implementation is chosen by `MOCKS` and the mailbox's
 * provider, never by an `if` in feature code (project-rules "Mocks"). Gmail-API mailboxes poll with
 * the Gmail API; SMTP mailboxes fall back to IMAP; everything is `mock` under MOCKS.
 */

import { env } from "@/env";
import type { InboundReplySource } from "@/contracts/outreach-channel";

import { gmailInboundSource } from "./gmail-api";
import { imapInboundSource } from "./imap";
import { mockInboundSource } from "./mock";

export function getInboundReplySource(provider: string): InboundReplySource {
  if (env.MOCKS) return mockInboundSource;
  switch (provider) {
    case "gmail-api":
      return gmailInboundSource;
    case "smtp":
    case "imap":
      return imapInboundSource;
    case "mock":
      return mockInboundSource;
    default:
      return gmailInboundSource;
  }
}
