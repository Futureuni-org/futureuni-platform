import "server-only";

/**
 * Gmail API EmailSender (ADR-016, option a). Sends a raw RFC 5322 message through
 * `users.messages.send`, keeping follow-ups in the same thread, then reads the stored Message-ID
 * back (Gmail may replace ours). OAuth credentials (clientId, clientSecret, refreshToken) come only
 * from the credentials vault, keyed `outreach-mailbox:<mailboxId>` (INV-21).
 *
 * Verified against current Gmail API docs during Phase 12 (see phases/12/SUMMARY.md for URLs). This
 * adapter is selected only when OUTREACH_SENDER=gmail-api and MOCKS=false; tests use the mock.
 */

import { AppError } from "@/lib/errors";
import type { EmailSender, OutboundEmail, SendResultSchema } from "@/contracts/outreach-channel";
import type { z } from "zod";
import { getCredential } from "@/platform/credentials";
import { readFile } from "@/platform/storage";

type SendResult = z.infer<typeof SendResultSchema>;

interface GmailOAuth {
  clientId: string;
  clientSecret: string;
  refreshToken?: string;
}

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SEND_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";
const GET_URL = (id: string): string =>
  `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=Message-ID`;

async function accessToken(oauth: GmailOAuth): Promise<string> {
  if (oauth.refreshToken === undefined) {
    throw new AppError("PROVIDER_ERROR", "Mailbox OAuth has no refresh token.");
  }
  const body = new URLSearchParams({
    client_id: oauth.clientId,
    client_secret: oauth.clientSecret,
    refresh_token: oauth.refreshToken,
    grant_type: "refresh_token",
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new AppError("PROVIDER_ERROR", `Gmail token exchange failed (${String(res.status)}).`);
  const json = (await res.json()) as { access_token?: string };
  if (typeof json.access_token !== "string") throw new AppError("PROVIDER_ERROR", "Gmail token response had no access_token.");
  return json.access_token;
}

function encodeHeaderValue(value: string): string {
  // ASCII values pass through; anything else is RFC 2047 encoded-word (UTF-8, base64).
  if (/^[\x20-\x7E]*$/.test(value)) return value;
  return `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

async function buildRawMime(email: OutboundEmail): Promise<string> {
  const from = email.from.name === undefined
    ? email.from.address
    : `${encodeHeaderValue(email.from.name)} <${email.from.address}>`;
  const to = email.to.name === undefined
    ? email.to.address
    : `${encodeHeaderValue(email.to.name)} <${email.to.address}>`;

  const headerLines: string[] = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${encodeHeaderValue(email.subject)}`,
    `Message-ID: ${email.headers["Message-ID"]}`,
    `List-Unsubscribe: ${email.headers["List-Unsubscribe"]}`,
    `List-Unsubscribe-Post: ${email.headers["List-Unsubscribe-Post"]}`,
    "MIME-Version: 1.0",
  ];
  if (email.replyTo !== undefined) headerLines.push(`Reply-To: ${email.replyTo}`);
  if (email.headers["In-Reply-To"] !== undefined) headerLines.push(`In-Reply-To: ${email.headers["In-Reply-To"]}`);
  if (email.headers.References !== undefined) headerLines.push(`References: ${email.headers.References}`);

  if (email.attachments.length === 0) {
    headerLines.push('Content-Type: text/plain; charset="UTF-8"', "Content-Transfer-Encoding: base64");
    const body = Buffer.from(email.text, "utf8").toString("base64");
    return `${headerLines.join("\r\n")}\r\n\r\n${body}`;
  }

  const boundary = `fu_${email.messageId}`;
  headerLines.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);
  const parts: string[] = [
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    Buffer.from(email.text, "utf8").toString("base64"),
  ];
  for (const att of email.attachments) {
    const data = await readFile(att.fileKey);
    parts.push(
      `--${boundary}`,
      `Content-Type: ${att.contentType}; name="${att.filename}"`,
      "Content-Transfer-Encoding: base64",
      `Content-Disposition: attachment; filename="${att.filename}"`,
      "",
      data.toString("base64"),
    );
  }
  parts.push(`--${boundary}--`, "");
  return `${headerLines.join("\r\n")}\r\n\r\n${parts.join("\r\n")}`;
}

export const gmailApiEmailSender: EmailSender = {
  id: "gmail-api",
  async send(email, ctx): Promise<SendResult> {
    const oauth = await getCredential<GmailOAuth>(ctx.credentialProvider);
    if (oauth === null) throw new AppError("PROVIDER_ERROR", `No credentials for mailbox ${ctx.mailboxId}.`);

    const token = await accessToken(oauth);
    const raw = await buildRawMime(email);
    const rawB64Url = Buffer.from(raw, "utf8").toString("base64url");

    const res = await fetch(SEND_URL, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({
        raw: rawB64Url,
        ...(email.providerThreadId === undefined ? {} : { threadId: email.providerThreadId }),
      }),
    });
    if (!res.ok) throw new AppError("PROVIDER_ERROR", `Gmail send failed (${String(res.status)}).`);
    const sent = (await res.json()) as { id?: string; threadId?: string };
    if (typeof sent.id !== "string") throw new AppError("PROVIDER_ERROR", "Gmail send returned no id.");

    // Read the stored Message-ID back; fall back to ours if the metadata call fails.
    let rfcMessageId = email.headers["Message-ID"];
    try {
      const meta = await fetch(GET_URL(sent.id), { headers: { authorization: `Bearer ${token}` } });
      if (meta.ok) {
        const body = (await meta.json()) as { payload?: { headers?: { name: string; value: string }[] } };
        const header = body.payload?.headers?.find((h) => h.name.toLowerCase() === "message-id");
        if (header !== undefined) rfcMessageId = header.value;
      }
    } catch {
      // keep our Message-ID
    }

    return {
      providerMessageId: sent.id,
      ...(sent.threadId === undefined ? {} : { providerThreadId: sent.threadId }),
      rfcMessageId,
      acceptedAt: ctx.clock.now().toISOString(),
    };
  },
};
