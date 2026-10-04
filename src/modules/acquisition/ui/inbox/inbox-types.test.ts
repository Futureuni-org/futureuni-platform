import { describe, expect, it } from "vitest";

import {
  newestFirst,
  reclassifyNotice,
  replyBlock,
  summariseRows,
  type ThreadRowView,
} from "./inbox-types";
import {
  conversationOnly,
  draftFor,
  isReplyDraft,
  latestReply,
  messageHeading,
  threadEntries,
  wasSent,
  type ThreadMessageView,
  type ThreadReplyView,
  type ThreadView,
} from "./thread-types";

const label = (value: string) => value.toLowerCase();

function row(overrides: Partial<ThreadRowView> & Pick<ThreadRowView, "leadId">): ThreadRowView {
  return {
    companyName: "Acme",
    market: "NIGERIA",
    ownerId: null,
    ownerName: null,
    classification: "INTERESTED",
    slaStatus: "NONE",
    slaDueAt: null,
    summary: null,
    unread: 0,
    needsHumanReview: false,
    latestAt: "2026-10-01T09:00:00.000Z",
    ...overrides,
  };
}

function message(
  overrides: Partial<ThreadMessageView> & Pick<ThreadMessageView, "id">,
): ThreadMessageView {
  return {
    kind: "ONE_OFF",
    status: "SENT",
    channel: "EMAIL",
    subject: null,
    body: "Hello",
    sentAt: "2026-10-01T09:00:00Z",
    createdAt: "2026-10-01T09:00:00Z",
    needsPricingApproval: false,
    inReplyToReplyId: null,
    citations: [],
    ...overrides,
  };
}

function reply(
  overrides: Partial<ThreadReplyView> & Pick<ThreadReplyView, "id" | "receivedAt">,
): ThreadReplyView {
  return {
    channel: "EMAIL",
    classification: "INTERESTED",
    confidence: 0.9,
    summary: null,
    text: "Sounds good",
    unread: false,
    slaStatus: "ON_TRACK",
    slaDueAt: null,
    needsHumanReview: false,
    objectionSummary: null,
    questions: [],
    followUpDate: null,
    referral: null,
    actionsTaken: [],
    ...overrides,
  };
}

describe("reclassifyNotice", () => {
  it("spells out the suppression when moving to unsubscribe", () => {
    const notice = reclassifyNotice("INTERESTED", "UNSUBSCRIBE", label);
    expect(notice.consequence).toContain(
      "This will suppress this contact and stop all outreach to the company",
    );
    expect(notice.tone).toBe("danger");
    expect(notice.confirmLabel).toBe("Suppress and reclassify");
  });

  it("explains that leaving unsubscribe does not lift the suppression", () => {
    const notice = reclassifyNotice("UNSUBSCRIBE", "QUESTION", label);
    expect(notice.consequence).toContain("The suppression stays in place");
    expect(notice.consequence).toContain("until an admin removes the suppression");
    expect(notice.tone).toBe("default");
  });

  it("says a plain reclassification re-runs the reply's actions", () => {
    const notice = reclassifyNotice("OTHER", "QUESTION", label);
    expect(notice.title).toBe("Reclassify as question?");
    expect(notice.consequence).toContain("actioned again under its new class");
  });
});

describe("replyBlock", () => {
  it("never lets an unsubscribe be answered, whatever the lead's status", () => {
    expect(replyBlock("UNSUBSCRIBE", "REPLIED")?.reason).toBe("unsubscribed");
    expect(replyBlock("UNSUBSCRIBE", "SUPPRESSED")?.reason).toBe("unsubscribed");
  });

  it("blocks any reply on a suppressed lead", () => {
    expect(replyBlock("INTERESTED", "SUPPRESSED")?.reason).toBe("suppressed");
    expect(replyBlock(null, "SUPPRESSED")?.reason).toBe("suppressed");
  });

  it("blocks a bounce: there is nobody to answer", () => {
    expect(replyBlock("BOUNCE", "CONTACTED")?.reason).toBe("bounced");
  });

  it("allows every other reply on an open lead, including one not yet classified", () => {
    expect(replyBlock("INTERESTED", "REPLIED")).toBeNull();
    expect(replyBlock("OBJECTION_PRICE", "CONTACTED")).toBeNull();
    expect(replyBlock("OUT_OF_OFFICE", "CONTACTED")).toBeNull();
    expect(replyBlock(null, "CONTACTED")).toBeNull();
  });

  it("explains the block in plain words", () => {
    expect(replyBlock("UNSUBSCRIBE", "REPLIED")?.message).toContain("no reply can be sent");
  });
});

describe("thread rows", () => {
  const rows = [
    row({ leadId: "c1", latestAt: "2026-10-01T09:00:00.000Z", unread: 2, slaStatus: "WARNING" }),
    row({ leadId: "c3", latestAt: "2026-10-03T09:00:00.000Z", slaStatus: "MET" }),
    row({ leadId: "c2", latestAt: "2026-10-02T09:00:00.000Z", unread: 1, slaStatus: "BREACHED" }),
    row({ leadId: "c4", latestAt: "2026-09-30T09:00:00.000Z", slaStatus: "ON_TRACK" }),
  ];

  it("puts the most recent reply first, without changing the list it was given", () => {
    expect(newestFirst(rows).map((r) => r.leadId)).toEqual(["c3", "c2", "c1", "c4"]);
    expect(rows.map((r) => r.leadId)).toEqual(["c1", "c3", "c2", "c4"]);
  });

  it("counts unread threads, not unread replies", () => {
    expect(summariseRows(rows).unread).toBe(2);
  });

  it("counts a thread as waiting while its response timer is running or overdue", () => {
    expect(summariseRows(rows)).toEqual({ shown: 4, unread: 2, waiting: 3 });
  });

  it("is all zeros for an empty list", () => {
    expect(summariseRows([])).toEqual({ shown: 0, unread: 0, waiting: 0 });
  });
});

describe("messageHeading", () => {
  it("only calls a message sent once it has gone out", () => {
    expect(messageHeading("SENT")).toBe("Sent by FUTUREUNI");
    expect(messageHeading("SENT_ASSISTED")).toBe("Sent by FUTUREUNI");
    expect(wasSent("SENT")).toBe(true);
  });

  it("names a scheduled, blocked or unsent message for what it is", () => {
    expect(messageHeading("SCHEDULED")).toBe("Scheduled to send");
    expect(messageHeading("BLOCKED")).toBe("Not sent");
    expect(messageHeading("FAILED")).toBe("Not sent");
    expect(messageHeading("DRAFT")).toBe("Draft");
    expect(wasSent("SCHEDULED")).toBe(false);
    expect(wasSent("BLOCKED")).toBe(false);
  });
});

describe("thread helpers", () => {
  const thread: ThreadView = {
    messages: [
      message({ id: "m1" }),
      message({
        id: "d1",
        status: "DRAFT",
        inReplyToReplyId: "r2",
        createdAt: "2026-10-02T10:00:00Z",
      }),
      message({
        id: "d2",
        status: "DRAFT",
        inReplyToReplyId: "r2",
        createdAt: "2026-10-02T11:00:00Z",
      }),
      message({
        id: "d0",
        status: "CANCELLED",
        inReplyToReplyId: "r1",
        createdAt: "2026-10-01T12:00:00Z",
      }),
      message({ id: "m2", status: "SENT", inReplyToReplyId: "r1", sentAt: "2026-10-01T13:00:00Z" }),
    ],
    replies: [
      reply({ id: "r1", receivedAt: "2026-10-01T11:00:00Z" }),
      reply({ id: "r2", receivedAt: "2026-10-02T09:00:00Z" }),
    ],
  };

  it("treats unsent and cancelled responses to a reply as drafts, but not sent ones", () => {
    expect(thread.messages.filter(isReplyDraft).map((m) => m.id)).toEqual(["d1", "d2", "d0"]);
  });

  it("keeps drafts out of the conversation", () => {
    expect(conversationOnly(thread).messages.map((m) => m.id)).toEqual(["m1", "m2"]);
  });

  it("gives the composer the newest live draft for a reply", () => {
    expect(draftFor(thread, "r2")?.id).toBe("d2");
    // The only response to r1 was cancelled when a reply was sent, so there is nothing to load.
    expect(draftFor(thread, "r1")).toBeNull();
  });

  it("picks the most recent reply to act on", () => {
    expect(latestReply(thread)?.id).toBe("r2");
    expect(latestReply({ messages: [], replies: [] })).toBeNull();
  });

  it("orders messages and replies together by time", () => {
    const ids = threadEntries(conversationOnly(thread)).map((entry) =>
      entry.type === "message" ? entry.message.id : entry.reply.id,
    );
    expect(ids).toEqual(["m1", "r1", "m2", "r2"]);
  });
});
