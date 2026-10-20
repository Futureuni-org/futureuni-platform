import { describe, it, expect, beforeEach, vi } from "vitest";

import type { Clock } from "@/contracts/common";

const h = vi.hoisted(() => {
  const client = {
    mailbox: { uidValidity: 42n } as { uidValidity: bigint } | false,
    connect: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    logout: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    getMailboxLock: vi.fn(),
    search: vi.fn(),
    fetch: vi.fn(),
  };
  // A regular function so `new ImapFlow(...)` works (arrow functions are not constructors).
  const ImapFlowMock = vi.fn(function ImapFlow() {
    return client;
  });
  return { client, ImapFlowMock, getCredential: vi.fn(), simpleParser: vi.fn() };
});

vi.mock("imapflow", () => ({ ImapFlow: h.ImapFlowMock }));
vi.mock("mailparser", () => ({ simpleParser: h.simpleParser }));
vi.mock("@/platform/credentials", () => ({ getCredential: h.getCredential }));

import { imapInboundSource } from "./imap";

const CLOCK: Clock = { now: () => new Date("2026-10-20T10:00:00Z") };
const CTX = { clock: CLOCK, signal: new AbortController().signal };
const MAILBOX = {
  id: "cmui6is1c00038wi3bkyncetl",
  address: "hello@go.futureuni.org",
  credentialProvider: "outreach-mailbox:cmui6is1c00038wi3bkyncetl" as const,
};

function parsedMail(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    messageId: "<reply@acme.com>",
    inReplyTo: "<our-msg@go.futureuni.org>",
    references: "<our-msg@go.futureuni.org> <older@go.futureuni.org>",
    from: { value: [{ address: "pat@acme.com", name: "Pat Buyer" }] },
    to: { value: [{ address: "hello@go.futureuni.org", name: "" }] },
    cc: undefined,
    subject: "Re: a quick idea",
    date: new Date("2026-10-20T09:30:00Z"),
    text: "Yes, let's talk.",
    html: false,
    attachments: [],
    headerLines: [{ key: "content-type", line: "Content-Type: text/plain; charset=UTF-8" }],
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  h.client.mailbox = { uidValidity: 42n };
  h.client.getMailboxLock.mockResolvedValue({ release: vi.fn() });
  h.getCredential.mockResolvedValue({
    host: "smtp.zoho.com",
    port: 465,
    user: "hello@go.futureuni.org",
    pass: "secret",
  });
  h.simpleParser.mockResolvedValue(parsedMail());
});

describe("imapInboundSource.poll", () => {
  it("throws PROVIDER_ERROR when the mailbox has no stored credential", async () => {
    h.getCredential.mockResolvedValueOnce(null);
    await expect(imapInboundSource.poll(MAILBOX, null, CTX)).rejects.toMatchObject({
      code: "PROVIDER_ERROR",
    });
    expect(h.ImapFlowMock).not.toHaveBeenCalled();
  });

  it("derives the IMAP host from the SMTP host (smtp.→imap., port 993, TLS)", async () => {
    h.client.search.mockResolvedValue([]);
    await imapInboundSource.poll(MAILBOX, null, CTX);
    expect(h.ImapFlowMock).toHaveBeenCalledWith(
      expect.objectContaining({
        host: "imap.zoho.com",
        port: 993,
        secure: true,
        auth: { user: "hello@go.futureuni.org", pass: "secret" },
      }),
    );
  });

  it("full sync (no cursor): searches recent, fetches, returns the <uidValidity>:<maxUid> cursor", async () => {
    h.client.search.mockResolvedValue([10, 11]);
    h.client.fetch.mockReturnValue([
      { uid: 10, source: Buffer.from("raw10"), internalDate: new Date("2026-10-20T08:00:00Z") },
      { uid: 11, source: Buffer.from("raw11"), internalDate: new Date("2026-10-20T09:00:00Z") },
    ]);
    const result = await imapInboundSource.poll(MAILBOX, null, CTX);
    expect(result.messages).toHaveLength(2);
    expect(result.nextCursor).toBe("42:11");
    expect(h.client.search).toHaveBeenCalledWith(
      { since: new Date("2026-10-18T10:00:00Z") },
      { uid: true },
    );
  });

  it("incremental (same uidValidity): fetches <lastUid+1>:* and skips the leftover at/under the cursor", async () => {
    h.client.fetch.mockReturnValue([
      { uid: 11, source: Buffer.from("leftover") }, // the `N:*` quirk returns the last msg; must be skipped
      { uid: 12, source: Buffer.from("new") },
    ]);
    const result = await imapInboundSource.poll(MAILBOX, "42:11", CTX);
    expect(h.client.fetch).toHaveBeenCalledWith("12:*", expect.anything(), { uid: true });
    expect(result.messages).toHaveLength(1);
    expect(result.nextCursor).toBe("42:12");
  });

  it("maps a parsed reply into InboundEmail (addresses, references, subject)", async () => {
    h.client.fetch.mockReturnValue([{ uid: 20, source: Buffer.from("raw") }]);
    const result = await imapInboundSource.poll(MAILBOX, "42:19", CTX);
    const msg = result.messages[0];
    expect(msg).toBeDefined();
    expect(msg?.rfcMessageId).toBe("<reply@acme.com>");
    expect(msg?.inReplyTo).toBe("<our-msg@go.futureuni.org>");
    expect(msg?.references).toEqual(["<our-msg@go.futureuni.org>", "<older@go.futureuni.org>"]);
    expect(msg?.from).toEqual({ address: "pat@acme.com", name: "Pat Buyer" });
    expect(msg?.subject).toBe("Re: a quick idea");
    expect(msg?.textBody).toBe("Yes, let's talk.");
    expect(msg?.isDeliveryStatusNotification).toBe(false);
  });

  it("flags a bounce (multipart/report; delivery-status) as a delivery-status notification", async () => {
    h.simpleParser.mockResolvedValue(
      parsedMail({
        headerLines: [
          {
            key: "content-type",
            line: "Content-Type: multipart/report; report-type=delivery-status",
          },
        ],
      }),
    );
    h.client.fetch.mockReturnValue([{ uid: 30, source: Buffer.from("raw") }]);
    const result = await imapInboundSource.poll(MAILBOX, "42:29", CTX);
    expect(result.messages[0]?.isDeliveryStatusNotification).toBe(true);
  });

  it("resyncs when the server's UIDVALIDITY changed (new validity → search path, 0 baseline)", async () => {
    h.client.mailbox = { uidValidity: 99n };
    h.client.search.mockResolvedValue([]);
    const result = await imapInboundSource.poll(MAILBOX, "42:11", CTX);
    expect(h.client.search).toHaveBeenCalled();
    expect(result.nextCursor).toBe("99:0");
  });
});
