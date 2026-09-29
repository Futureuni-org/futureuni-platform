import { describe, expect, it } from "vitest";

import { applyPiiPolicy } from "./pii";

describe("applyPiiPolicy", () => {
  it("removes personal fields not on the allowlist", () => {
    const input = { company: { name: "Acme" }, contact: { email: "x@y.com", phone: "1" } };
    const out = applyPiiPolicy(input, { allowedPersonalFields: [] });
    expect(out).toStrictEqual({ company: { name: "Acme" }, contact: {} });
  });

  it("keeps explicitly allowed nested fields", () => {
    const input = { contact: { email: "x@y.com", phone: "1" } };
    const out = applyPiiPolicy(input, { allowedPersonalFields: ["contact.email"] });
    expect(out).toStrictEqual({ contact: { email: "x@y.com" } });
  });

  it("keeps array-nested fields with [] syntax", () => {
    const input = { contacts: [{ email: "a@b.com" }, { email: "c@d.com", phone: "9" }] };
    const out = applyPiiPolicy(input, { allowedPersonalFields: ["contacts[].email"] });
    expect(out).toStrictEqual({ contacts: [{ email: "a@b.com" }, { email: "c@d.com" }] });
  });

  it("does not mutate the input", () => {
    const input = { contact: { email: "x@y.com" } };
    const copy = JSON.parse(JSON.stringify(input)) as typeof input;
    applyPiiPolicy(input, { allowedPersonalFields: [] });
    expect(input).toStrictEqual(copy);
  });
});
