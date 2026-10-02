import "server-only";

/**
 * IMAP inbound source: the generic fallback for mailboxes not on the Gmail API (ADR-016). It needs
 * an IMAP transport dependency, and `package.json` is owned by Phase 1, so — mirroring Phase 12's
 * `smtp` sender stub (phases/12/REQUESTS.md, CR-12-05) — it ships as a typed stub that refuses to
 * poll until the transport is added at go-live. The Gmail API source is the ADR-016 primary and is
 * fully implemented. See phases/13/REQUESTS.md.
 */

import type { InboundReplySource } from "@/contracts/outreach-channel";
import { AppError } from "@/lib/errors";

export const imapInboundSource: InboundReplySource = {
  id: "imap",
  poll: () => {
    throw new AppError(
      "PROVIDER_ERROR",
      "The IMAP reply source is not yet wired: it needs an IMAP transport dependency added by Phase 1 (see phases/13/REQUESTS.md). Use the gmail-api or mock source.",
    );
  },
};
