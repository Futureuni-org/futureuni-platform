import { describe, expect, it } from "vitest";

import { signUnsubscribeToken, verifyUnsubscribeToken } from "./tokens";

const payload = {
  v: 1 as const,
  tid: "cmocktid000000000000000001",
  mid: "cmockmid000000000000000001",
  cid: "cmockcid000000000000000001",
  scope: "COMPANY" as const,
};

describe("unsubscribe tokens", () => {
  it("round-trips a payload", () => {
    const token = signUnsubscribeToken(payload);
    expect(verifyUnsubscribeToken(token)).toEqual(payload);
  });

  it("rejects a tampered body", () => {
    const token = signUnsubscribeToken(payload);
    const [body, sig] = token.split(".");
    const flipped = `${(body ?? "").slice(0, -2)}XY.${sig ?? ""}`;
    expect(verifyUnsubscribeToken(flipped)).toBeNull();
  });

  it("rejects a tampered signature", () => {
    const token = signUnsubscribeToken(payload);
    const [body] = token.split(".");
    expect(verifyUnsubscribeToken(`${body ?? ""}.not-a-real-signature`)).toBeNull();
  });

  it("rejects a malformed token", () => {
    expect(verifyUnsubscribeToken("garbage")).toBeNull();
    expect(verifyUnsubscribeToken("")).toBeNull();
  });
});
