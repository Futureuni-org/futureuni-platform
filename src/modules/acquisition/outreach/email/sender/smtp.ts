import "server-only";

/**
 * Generic SMTP EmailSender (ADR-016 fallback). The ADR's primary sender is `gmail-api`; SMTP is only
 * a fallback for a later go-live and is **not** wired in this phase. A real SMTP transport needs a
 * dependency (e.g. nodemailer) that Phase 12 may not add — `package.json` is owned by Phase 1 — so
 * this adapter is a typed stub that refuses to send. See `phases/12/REQUESTS.md` (CR-12-05): Phase 1
 * adds the transport dependency and Phase 21 completes the send here when SMTP is actually used.
 *
 * Tests and preview/production-with-mocks use the `mock` sender; nothing selects `smtp` unless an
 * operator sets `OUTREACH_SENDER=smtp` with `MOCKS=false`, which only happens after go-live wiring.
 */

import { AppError } from "@/lib/errors";
import type { EmailSender, SendResultSchema } from "@/contracts/outreach-channel";
import type { z } from "zod";

type SendResult = z.infer<typeof SendResultSchema>;

export const smtpEmailSender: EmailSender = {
  id: "smtp",
  send(_email, ctx): Promise<SendResult> {
    return Promise.reject(
      new AppError(
        "PROVIDER_ERROR",
        `The SMTP sender is not wired yet (mailbox ${ctx.mailboxId}). Use OUTREACH_SENDER=gmail-api, or complete the SMTP transport at go-live (phases/12/REQUESTS.md CR-12-05).`,
      ),
    );
  },
};
