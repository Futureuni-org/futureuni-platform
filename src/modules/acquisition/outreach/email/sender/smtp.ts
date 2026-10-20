import "server-only";

/**
 * Generic SMTP EmailSender (ADR-016). Sends outreach over SMTP with nodemailer — the same transport
 * the platform-email adapter uses — so a mailbox on any provider (Zoho, Hostinger, a dedicated
 * outreach host) can send without a provider-specific API. Per-mailbox credentials
 * ({ host, port, secure?, user, pass }) come only from the credentials vault, keyed
 * `outreach-mailbox:<mailboxId>` (INV-21); never from env or feature code.
 *
 * Selected when OUTREACH_SENDER=smtp and MOCKS=false. Unlike the Gmail API, SMTP preserves the
 * Message-ID we set, so the result's `rfcMessageId` is our own id and follow-ups thread on the
 * In-Reply-To / References headers the send path passes through (SMTP has no provider thread id).
 */

import { AppError } from "@/lib/errors";
import type { EmailSender, OutboundEmail, SendResultSchema } from "@/contracts/outreach-channel";
import type { z } from "zod";
import { getCredential } from "@/platform/credentials";
import { readFile } from "@/platform/storage";

type SendResult = z.infer<typeof SendResultSchema>;

interface SmtpCredential {
  host: string;
  port: number;
  user: string;
  pass: string;
  secure?: boolean;
}

interface SmtpAttachment {
  filename: string;
  content: Buffer;
  contentType: string;
}

async function buildAttachments(email: OutboundEmail): Promise<SmtpAttachment[]> {
  const out: SmtpAttachment[] = [];
  for (const att of email.attachments) {
    out.push({
      filename: att.filename,
      content: await readFile(att.fileKey),
      contentType: att.contentType,
    });
  }
  return out;
}

function addressField(party: OutboundEmail["from"]): string | { name: string; address: string } {
  return party.name === undefined ? party.address : { name: party.name, address: party.address };
}

export const smtpEmailSender: EmailSender = {
  id: "smtp",
  async send(email, ctx): Promise<SendResult> {
    const creds = await getCredential<SmtpCredential>(ctx.credentialProvider);
    if (creds === null) {
      throw new AppError("PROVIDER_ERROR", `No SMTP credentials for mailbox ${ctx.mailboxId}.`);
    }
    if (
      typeof creds.host !== "string" ||
      typeof creds.port !== "number" ||
      typeof creds.user !== "string" ||
      typeof creds.pass !== "string"
    ) {
      throw new AppError(
        "PROVIDER_ERROR",
        `Incomplete SMTP credentials for mailbox ${ctx.mailboxId}.`,
      );
    }

    // The two deliverability headers the contract requires; Message-ID / threading go via the
    // dedicated nodemailer fields below so no header is set twice.
    const headers: Record<string, string> = {
      "List-Unsubscribe": email.headers["List-Unsubscribe"],
      "List-Unsubscribe-Post": email.headers["List-Unsubscribe-Post"],
    };

    // Dynamic import keeps nodemailer out of the test/build graph until a real send runs.
    const { default: nodemailer } = await import("nodemailer");
    const transport = nodemailer.createTransport({
      host: creds.host,
      port: creds.port,
      secure: creds.secure ?? creds.port === 465, // implicit TLS on 465; STARTTLS on 587
      auth: { user: creds.user, pass: creds.pass },
      connectionTimeout: 20_000,
      greetingTimeout: 15_000,
    });

    const attachments = await buildAttachments(email);

    let info;
    try {
      info = await transport.sendMail({
        from: addressField(email.from),
        to: addressField(email.to),
        subject: email.subject,
        text: email.text,
        ...(email.html === undefined ? {} : { html: email.html }),
        ...(email.replyTo === undefined ? {} : { replyTo: email.replyTo }),
        messageId: email.headers["Message-ID"],
        ...(email.headers["In-Reply-To"] === undefined
          ? {}
          : { inReplyTo: email.headers["In-Reply-To"] }),
        ...(email.headers.References === undefined ? {} : { references: email.headers.References }),
        headers,
        ...(attachments.length === 0 ? {} : { attachments }),
      });
    } catch {
      // Keep the response free of SMTP internals (project-rules: no internals in responses). The
      // detailed failure is available to admins through the mailbox "test connection" path.
      throw new AppError("PROVIDER_ERROR", `SMTP send failed for mailbox ${ctx.mailboxId}.`);
    }

    if (info.rejected.length > 0) {
      throw new AppError(
        "PROVIDER_ERROR",
        `SMTP rejected the recipient for mailbox ${ctx.mailboxId}.`,
      );
    }

    return {
      providerMessageId: info.messageId,
      rfcMessageId: email.headers["Message-ID"],
      acceptedAt: ctx.clock.now().toISOString(),
    };
  },
};
