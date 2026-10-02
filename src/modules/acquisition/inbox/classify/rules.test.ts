import { describe, expect, it } from "vitest";

import { classifyDeterministic, detectBounce, detectOutOfOffice, detectUnsubscribe, type ReplySignals } from "./rules";

const noHeaders: ReplySignals = { headers: {}, fromAddress: "sam@acme.example", subject: "Re: hi" };

describe("detectBounce (DSN, RFC 3464)", () => {
  it("reads a hard bounce from a multipart/report with Status 5.x.x and the final recipient", () => {
    const sig: ReplySignals = { headers: { "Content-Type": 'multipart/report; report-type=delivery-status; boundary="b"' }, fromAddress: "mailer-daemon@mail.example", subject: "Delivery failure" };
    const body = "Your message failed.\n\nFinal-Recipient: rfc822; old@acme.example\nAction: failed\nStatus: 5.1.1";
    expect(detectBounce(sig, null, body)).toEqual({ email: "old@acme.example", kind: "HARD" });
  });

  it("reads a soft bounce from a 4.x.x status", () => {
    const sig: ReplySignals = { headers: { "Content-Type": "multipart/report; report-type=delivery-status" }, fromAddress: "postmaster@mail.example", subject: "Delayed" };
    const body = "Final-Recipient: rfc822; busy@acme.example\nAction: delayed\nStatus: 4.2.2";
    expect(detectBounce(sig, null, body)).toEqual({ email: "busy@acme.example", kind: "SOFT" });
  });

  it("returns null for a normal reply", () => {
    expect(detectBounce(noHeaders, null, "Hi, sounds good.")).toBeNull();
  });
});

describe("detectOutOfOffice (RFC 3834)", () => {
  it("matches an Auto-Submitted: auto-replied header", () => {
    const sig: ReplySignals = { headers: { "Auto-Submitted": "auto-replied" }, fromAddress: "sam@acme.example", subject: "away" };
    expect(detectOutOfOffice(sig, "I am away.")).not.toBeNull();
  });

  it("matches an out-of-office subject and extracts a return date", () => {
    const sig: ReplySignals = { headers: {}, fromAddress: "sam@acme.example", subject: "Automatic reply: Out of office" };
    const res = detectOutOfOffice(sig, "I will be back on October 14. Please contact reception.");
    expect(res?.returnDateText).toContain("October 14");
  });

  it("matches a bulk Precedence", () => {
    const sig: ReplySignals = { headers: { Precedence: "bulk" }, fromAddress: "sam@acme.example", subject: "notice" };
    expect(detectOutOfOffice(sig, "")).not.toBeNull();
  });

  it("returns null for a human reply", () => {
    expect(detectOutOfOffice(noHeaders, "Thanks, let's talk.")).toBeNull();
  });
});

describe("detectUnsubscribe", () => {
  it("catches stop-contact phrases", () => {
    for (const t of ["please unsubscribe me", "remove me from your list", "stop emailing me", "do not contact me", "take me off", "opt out please"]) {
      expect(detectUnsubscribe(t)).toBe(true);
    }
  });
  it("ignores ordinary interest", () => {
    expect(detectUnsubscribe("Yes, please send more details.")).toBe(false);
  });
});

describe("classifyDeterministic order", () => {
  it("prefers BOUNCE, then OUT_OF_OFFICE, then UNSUBSCRIBE", () => {
    const dsn: ReplySignals = { headers: { "Content-Type": "multipart/report; report-type=delivery-status" }, fromAddress: "mailer-daemon@x", subject: "fail" };
    expect(classifyDeterministic(dsn, "old@acme.example", "", "Status: 5.0.0")?.classification).toBe("BOUNCE");

    const ooo: ReplySignals = { headers: { "Auto-Submitted": "auto-replied" }, fromAddress: "sam@x", subject: "away" };
    expect(classifyDeterministic(ooo, null, "please remove me", "please remove me")?.classification).toBe("OUT_OF_OFFICE");

    expect(classifyDeterministic(noHeaders, null, "unsubscribe me", "unsubscribe me")?.classification).toBe("UNSUBSCRIBE");

    expect(classifyDeterministic(noHeaders, null, "Yes let's chat", "Yes let's chat")).toBeNull();
  });
});
