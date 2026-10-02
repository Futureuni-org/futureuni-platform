import "server-only";

/**
 * Gmail API inbound source (ADR-016, option a). Replies are polled with `users.history.list` from
 * the stored `historyId`; a stale cursor returns HTTP 404 and triggers a full sync via
 * `users.messages.list`. New message ids are fetched with `users.messages.get?format=full` and
 * parsed into `InboundEmail`. OAuth credentials come from the vault key `outreach-mailbox:<id>`
 * (INV-21). It is written to the REST API but exercised live only in Phase 21 (MOCKS everywhere in
 * development and tests), so it never runs in the mock test path.
 *
 * Sources verified 2026-10-01:
 * - https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.history/list
 * - https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/get
 */

import type { InboundEmail, InboundReplySource } from "@/contracts/outreach-channel";
import { AppError } from "@/lib/errors";
import { getCredential } from "@/platform/credentials";
import type { ProviderId } from "@/contracts/common";

interface GmailOAuthPayload {
  clientId?: string;
  clientSecret?: string;
  refreshToken?: string;
  accessToken?: string;
}

interface GmailHeader {
  name: string;
  value: string;
}
interface GmailPart {
  mimeType?: string;
  filename?: string;
  headers?: GmailHeader[];
  body?: { size?: number; data?: string; attachmentId?: string };
  parts?: GmailPart[];
}
interface GmailMessage {
  id: string;
  threadId: string;
  internalDate?: string;
  payload?: GmailPart;
}

const GMAIL = "https://gmail.googleapis.com/gmail/v1/users/me";

async function accessToken(credentialProvider: ProviderId): Promise<string> {
  const payload = (await getCredential(credentialProvider)) as GmailOAuthPayload | null;
  if (payload === null) throw new AppError("PROVIDER_ERROR", "No Gmail credential configured for this mailbox.");
  if (payload.accessToken !== undefined && payload.accessToken !== "") return payload.accessToken;
  if (payload.clientId === undefined || payload.clientSecret === undefined || payload.refreshToken === undefined) {
    throw new AppError("PROVIDER_ERROR", "Incomplete Gmail OAuth credential.");
  }
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: payload.clientId,
      client_secret: payload.clientSecret,
      refresh_token: payload.refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new AppError("PROVIDER_ERROR", "Gmail token exchange failed.");
  const json = (await res.json()) as { access_token?: string };
  if (json.access_token === undefined) throw new AppError("PROVIDER_ERROR", "Gmail token response had no access_token.");
  return json.access_token;
}

function decodeBase64Url(data: string): string {
  const normalised = data.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(normalised, "base64").toString("utf8");
}

function header(headers: GmailHeader[], name: string): string | undefined {
  return headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value;
}

function collectBodies(part: GmailPart | undefined, out: { text: string[]; html: string[]; attachments: InboundEmail["attachments"] }): void {
  if (part === undefined) return;
  const mime = part.mimeType ?? "";
  if (part.filename !== undefined && part.filename !== "") {
    out.attachments.push({ filename: part.filename, contentType: mime, sizeBytes: part.body?.size ?? 0 });
  } else if (mime === "text/plain" && part.body?.data !== undefined) {
    out.text.push(decodeBase64Url(part.body.data));
  } else if (mime === "text/html" && part.body?.data !== undefined) {
    out.html.push(decodeBase64Url(part.body.data));
  }
  for (const child of part.parts ?? []) collectBodies(child, out);
}

function parseAddress(raw: string | undefined): { address: string; name?: string } {
  if (raw === undefined) return { address: "" };
  const match = /^(.*?)<([^>]+)>\s*$/.exec(raw.trim());
  if (match !== null) {
    const name = match[1]?.replace(/(^"|"$)/g, "").trim() ?? "";
    return name === "" ? { address: match[2]?.trim() ?? "" } : { address: match[2]?.trim() ?? "", name };
  }
  return { address: raw.trim() };
}

function toInboundEmail(msg: GmailMessage): InboundEmail {
  const headers = msg.payload?.headers ?? [];
  const bodies: { text: string[]; html: string[]; attachments: InboundEmail["attachments"] } = { text: [], html: [], attachments: [] };
  collectBodies(msg.payload, bodies);
  const contentType = header(headers, "Content-Type") ?? "";
  const referencesRaw = header(headers, "References") ?? "";
  const headerSubset: Record<string, string> = {};
  for (const key of ["Auto-Submitted", "X-Autoreply", "Precedence", "Content-Type", "Return-Path", "X-Auto-Response-Suppress"]) {
    const v = header(headers, key);
    if (v !== undefined) headerSubset[key] = v;
  }
  const date = header(headers, "Date");
  return {
    providerMessageId: msg.id,
    providerThreadId: msg.threadId,
    ...(header(headers, "Message-ID") === undefined ? {} : { rfcMessageId: header(headers, "Message-ID") }),
    ...(header(headers, "In-Reply-To") === undefined ? {} : { inReplyTo: header(headers, "In-Reply-To") }),
    references: referencesRaw.split(/\s+/).filter((s) => s !== ""),
    from: parseAddress(header(headers, "From")),
    to: (header(headers, "To") ?? "").split(",").map((p) => parseAddress(p)).filter((a) => a.address !== ""),
    cc: [],
    subject: header(headers, "Subject") ?? "",
    date: date !== undefined ? new Date(date).toISOString() : new Date(Number(msg.internalDate ?? Date.now())).toISOString(),
    headers: headerSubset,
    textBody: bodies.text.join("\n"),
    ...(bodies.html.length > 0 ? { htmlBody: bodies.html.join("\n") } : {}),
    attachments: bodies.attachments,
    isDeliveryStatusNotification: /multipart\/report/i.test(contentType) && /delivery-status/i.test(contentType),
  };
}

export const gmailInboundSource: InboundReplySource = {
  id: "gmail-api",
  poll: async (mailbox, cursor, ctx) => {
    const token = await accessToken(mailbox.credentialProvider);
    const auth = { Authorization: `Bearer ${token}` };
    const newIds = new Set<string>();

    if (cursor !== null) {
      const url = new URL(`${GMAIL}/history`);
      url.searchParams.set("startHistoryId", cursor);
      url.searchParams.set("historyTypes", "messageAdded");
      const res = await fetch(url, { headers: auth, signal: ctx.signal });
      if (res.status === 404) {
        return fullSync(auth, ctx.signal);
      }
      if (!res.ok) throw new AppError("PROVIDER_ERROR", `Gmail history.list failed (${String(res.status)}).`);
      const json = (await res.json()) as { history?: { messagesAdded?: { message: { id: string } }[] }[]; historyId?: string };
      for (const h of json.history ?? []) for (const m of h.messagesAdded ?? []) newIds.add(m.message.id);
      const nextCursor = json.historyId ?? cursor;
      const messages = await fetchMessages(auth, [...newIds], ctx.signal);
      return { messages, nextCursor };
    }
    return fullSync(auth, ctx.signal);
  },
};

async function fullSync(auth: Record<string, string>, signal: AbortSignal): Promise<{ messages: InboundEmail[]; nextCursor: string }> {
  const url = new URL(`${GMAIL}/messages`);
  url.searchParams.set("q", "in:inbox newer_than:2d");
  url.searchParams.set("maxResults", "50");
  const res = await fetch(url, { headers: auth, signal });
  if (!res.ok) throw new AppError("PROVIDER_ERROR", `Gmail messages.list failed (${String(res.status)}).`);
  const json = (await res.json()) as { messages?: { id: string }[] };
  const messages = await fetchMessages(auth, (json.messages ?? []).map((m) => m.id), signal);
  // The cursor after a full sync is the mailbox's current historyId (users.getProfile).
  const profileRes = await fetch(`${GMAIL}/profile`, { headers: auth, signal });
  const profile = profileRes.ok ? ((await profileRes.json()) as { historyId?: string }) : { historyId: undefined };
  return { messages, nextCursor: profile.historyId ?? "" };
}

async function fetchMessages(auth: Record<string, string>, ids: string[], signal: AbortSignal): Promise<InboundEmail[]> {
  const out: InboundEmail[] = [];
  for (const id of ids) {
    const res = await fetch(`${GMAIL}/messages/${id}?format=full`, { headers: auth, signal });
    if (!res.ok) continue;
    out.push(toInboundEmail((await res.json()) as GmailMessage));
  }
  return out;
}
