import "server-only";

/**
 * IMAP inbound source (ADR-016 fallback): reads replies for a mailbox that sends over SMTP (Zoho,
 * Hostinger, any IMAP host), so outreach is two-way without a provider API. Credentials come only
 * from the vault key `outreach-mailbox:<id>` (INV-21) — the same entry the SMTP sender uses. The
 * IMAP host defaults to the SMTP host with `smtp.`→`imap.` on port 993 (Zoho, Hostinger and most
 * hosts follow this), and can be overridden with `imapHost`/`imapPort`/`imapSecure` on the entry.
 *
 * The cursor is `<uidValidity>:<lastUid>`: a new UIDVALIDITY (the server renumbered the mailbox)
 * triggers a 2-day resync. Selected only when the mailbox provider is `smtp`/`imap` and MOCKS=false;
 * tests use the mock source. No real network in unit tests: `imapflow` and `mailparser` are mocked.
 */

import type { ParsedMail, AddressObject } from "mailparser";

import type { InboundEmail, InboundReplySource } from "@/contracts/outreach-channel";
import { AppError } from "@/lib/errors";
import { getCredential } from "@/platform/credentials";

interface MailboxCredential {
  host: string;
  port: number;
  user: string;
  pass: string;
  secure?: boolean;
  imapHost?: string;
  imapPort?: number;
  imapSecure?: boolean;
}

interface ImapSettings {
  host: string;
  port: number;
  secure: boolean;
  auth: { user: string; pass: string };
}

const RESYNC_WINDOW_MS = 2 * 24 * 60 * 60 * 1000;
const HEADER_SUBSET = [
  "Auto-Submitted",
  "X-Autoreply",
  "Precedence",
  "Content-Type",
  "Return-Path",
  "X-Auto-Response-Suppress",
] as const;

function imapSettingsFrom(cred: MailboxCredential): ImapSettings {
  const host = cred.imapHost ?? cred.host.replace(/^smtp\./i, "imap.");
  const port = cred.imapPort ?? 993;
  const secure = cred.imapSecure ?? true;
  return { host, port, secure, auth: { user: cred.user, pass: cred.pass } };
}

function parseCursor(cursor: string | null): { uidValidity: string; lastUid: number } | null {
  if (cursor === null) return null;
  const at = cursor.indexOf(":");
  if (at < 0) return null;
  const uidValidity = cursor.slice(0, at);
  const lastUid = Number(cursor.slice(at + 1));
  if (uidValidity === "" || !Number.isInteger(lastUid)) return null;
  return { uidValidity, lastUid };
}

function firstAddress(addr: AddressObject | AddressObject[] | undefined): {
  address: string;
  name?: string;
} {
  const list = addr === undefined ? [] : Array.isArray(addr) ? addr : [addr];
  for (const group of list) {
    for (const value of group.value) {
      if (value.address !== undefined && value.address !== "") {
        const name = value.name.trim();
        return name === ""
          ? { address: value.address }
          : { address: value.address, name: name.slice(0, 120) };
      }
    }
  }
  return { address: "" };
}

function allAddresses(
  addr: AddressObject | AddressObject[] | undefined,
): { address: string; name?: string }[] {
  const list = addr === undefined ? [] : Array.isArray(addr) ? addr : [addr];
  const out: { address: string; name?: string }[] = [];
  for (const group of list) {
    for (const value of group.value) {
      if (value.address !== undefined && value.address !== "") {
        const name = value.name.trim();
        out.push(
          name === ""
            ? { address: value.address }
            : { address: value.address, name: name.slice(0, 120) },
        );
      }
    }
  }
  return out;
}

function normaliseReferences(refs: ParsedMail["references"]): string[] {
  if (refs === undefined) return [];
  const parts = Array.isArray(refs) ? refs : refs.split(/\s+/);
  return parts.map((r) => r.trim()).filter((r) => r !== "");
}

/** The raw value of a header from `headerLines` (robust across mailparser's structured types). */
function headerValue(parsed: ParsedMail, key: string): string | undefined {
  const lower = key.toLowerCase();
  const found = parsed.headerLines.find((line) => line.key === lower);
  if (found === undefined) return undefined;
  const colon = found.line.indexOf(":");
  return colon < 0 ? found.line.trim() : found.line.slice(colon + 1).trim();
}

function isDeliveryStatus(parsed: ParsedMail): boolean {
  const ct = (headerValue(parsed, "content-type") ?? "").toLowerCase();
  return ct.includes("multipart/report") && ct.includes("delivery-status");
}

function toInboundEmail(
  parsed: ParsedMail,
  uid: number,
  internalDate: Date | string | undefined,
  fallbackTo: string,
): InboundEmail {
  const headers: Record<string, string> = {};
  for (const key of HEADER_SUBSET) {
    const value = headerValue(parsed, key);
    if (value !== undefined) headers[key] = value;
  }

  const to = allAddresses(parsed.to);
  const date = parsed.date ?? (internalDate !== undefined ? new Date(internalDate) : new Date());

  return {
    providerMessageId: parsed.messageId ?? `imap-uid-${String(uid)}`,
    ...(parsed.messageId === undefined ? {} : { rfcMessageId: parsed.messageId }),
    ...(parsed.inReplyTo === undefined ? {} : { inReplyTo: parsed.inReplyTo }),
    references: normaliseReferences(parsed.references),
    from: firstAddress(parsed.from),
    to: to.length > 0 ? to : [{ address: fallbackTo }],
    cc: allAddresses(parsed.cc),
    subject: (parsed.subject ?? "").slice(0, 500),
    date: date.toISOString(),
    headers,
    textBody: parsed.text ?? "",
    ...(typeof parsed.html === "string" ? { htmlBody: parsed.html } : {}),
    attachments: parsed.attachments.map((a) => ({
      filename: a.filename ?? "attachment",
      contentType: a.contentType,
      sizeBytes: a.size,
    })),
    isDeliveryStatusNotification: isDeliveryStatus(parsed),
  };
}

export const imapInboundSource: InboundReplySource = {
  id: "imap",
  poll: async (mailbox, cursor, ctx) => {
    const cred = await getCredential<MailboxCredential>(mailbox.credentialProvider);
    if (cred === null) {
      throw new AppError("PROVIDER_ERROR", `No credentials for mailbox ${mailbox.id}.`);
    }
    const settings = imapSettingsFrom(cred);

    const { ImapFlow } = await import("imapflow");
    const { simpleParser } = await import("mailparser");

    const client = new ImapFlow({
      host: settings.host,
      port: settings.port,
      secure: settings.secure,
      auth: settings.auth,
      logger: false,
      emitLogs: false,
      connectionTimeout: 20_000,
      greetingTimeout: 15_000,
      socketTimeout: 30_000,
    });

    try {
      await client.connect();
    } catch (error) {
      throw new AppError(
        "PROVIDER_ERROR",
        `IMAP connection failed for mailbox ${mailbox.id}: ${error instanceof Error ? error.message.slice(0, 200) : "unknown error"}`,
      );
    }

    try {
      const lock = await client.getMailboxLock("INBOX");
      try {
        const uidValidity = String(client.mailbox === false ? "0" : client.mailbox.uidValidity);
        const prev = parseCursor(cursor);
        // The cursor's UID only applies when the server hasn't renumbered the mailbox; otherwise resync.
        const prevUid = prev !== null && prev.uidValidity === uidValidity ? prev.lastUid : null;

        let range: string | number[] | null;
        if (prevUid !== null) {
          range = `${String(prevUid + 1)}:*`;
        } else {
          const since = new Date(ctx.clock.now().getTime() - RESYNC_WINDOW_MS);
          const uids = await client.search({ since }, { uid: true });
          range = Array.isArray(uids) && uids.length > 0 ? uids : null;
        }

        const messages: InboundEmail[] = [];
        let maxUid = prevUid ?? 0;

        if (range !== null) {
          for await (const msg of client.fetch(
            range,
            { uid: true, source: true, internalDate: true },
            { uid: true },
          )) {
            // `<lastUid+1>:*` can still return the last message; skip anything at/under the cursor.
            if (prevUid !== null && msg.uid <= prevUid) continue;
            if (msg.source === undefined) continue;
            const parsed = await simpleParser(msg.source);
            messages.push(toInboundEmail(parsed, msg.uid, msg.internalDate, mailbox.address));
            if (msg.uid > maxUid) maxUid = msg.uid;
          }
        }

        return { messages, nextCursor: `${uidValidity}:${String(maxUid)}` };
      } finally {
        lock.release();
      }
    } finally {
      await client.logout().catch(() => undefined);
    }
  },
};
