import { describe, expect, it } from "vitest";

import { classifyLocalPart, extractEmails, isPlaceholder } from "./emails";

describe("email extractor", () => {
  it("finds mailto:, visible text, obfuscated and schema.org emails, deduped and classified", () => {
    const html = `
      <a href="mailto:info@example.co.uk?subject=x">Email us</a>
      <p>Reach Ada at ada.lovelace@ada-labs.example</p>
      <p>Or write to hello [at] fixthisdesign [dot] com</p>
      <script>{"@context":"schema.org","@type":"LocalBusiness","email":"press@ada-labs.example"}</script>
      <p>Placeholder: you@domain.com</p>
      <p>Wix system: 2f7b9c@wixpress.com</p>
    `;
    const emails = extractEmails({ html, pageUrl: "https://ada-labs.example/contact" });
    const map = Object.fromEntries(emails.map((e) => [e.email, e]));
    expect(map["info@example.co.uk"]?.source).toBe("mailto");
    expect(map["ada.lovelace@ada-labs.example"]?.source).toBe("text");
    expect(map["hello@fixthisdesign.com"]?.source).toBe("obfuscated");
    expect(map["press@ada-labs.example"]?.source).toBe("schema-org");
    expect(map["you@domain.com"]).toBeUndefined();
    expect(map["2f7b9c@wixpress.com"]).toBeUndefined();
    expect(map["info@example.co.uk"]?.kind).toBe("ROLE");
    expect(map["ada.lovelace@ada-labs.example"]?.kind).toBe("PERSONAL");
  });

  it("classifies role vs personal local parts", () => {
    expect(classifyLocalPart("info")).toBe("ROLE");
    expect(classifyLocalPart("careers")).toBe("ROLE");
    expect(classifyLocalPart("hello")).toBe("ROLE");
    expect(classifyLocalPart("ada")).toBe("PERSONAL");
    expect(classifyLocalPart("j.smith")).toBe("PERSONAL");
  });

  it("filters placeholders and system domains", () => {
    expect(isPlaceholder("you", "domain.com")).toBe(true);
    expect(isPlaceholder("example", "anything.com")).toBe(true);
    expect(isPlaceholder("info", "wixpress.com")).toBe(true);
    expect(isPlaceholder("info", "acme.com")).toBe(false);
  });

  it("decodes numeric entities used to obfuscate the @", () => {
    const emails = extractEmails({ html: "hello&#64;acme-labs.example" });
    expect(emails[0]?.email).toBe("hello@acme-labs.example");
  });
});
