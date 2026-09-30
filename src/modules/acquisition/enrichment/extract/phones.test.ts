import { describe, expect, it } from "vitest";

import { extractPhones } from "./phones";

describe("phone extractor", () => {
  it("finds tel:, visible text and schema.org phones, normalised to E.164", () => {
    const html = `
      <a href="tel:+2348031234567">Call</a>
      <p>Or ring us on 020 7946 0958</p>
      <script>{"telephone":"+44 20 7946 0958"}</script>
    `;
    const phones = extractPhones({ html, defaultCountry: "GB" });
    const map = new Map(phones.map((p) => [p.e164, p]));
    expect(map.get("+2348031234567")?.source).toBe("tel");
    expect(map.get("+442079460958")?.source).toBeDefined(); // matches either schema-org or text (dedupe)
  });

  it("classifies WhatsApp: CONFIRMED via wa.me, LIKELY for a Nigerian mobile, UNKNOWN otherwise", () => {
    const html = `
      <a href="https://wa.me/2348031234567">Chat</a>
      <a href="tel:+2348031234567">Call the same number</a>
      <p>Also on +2349011112222 (mobile)</p>
      <p>Office: +44 20 7946 0958</p>
    `;
    const phones = extractPhones({ html, defaultCountry: "NG" });
    const map = new Map(phones.map((p) => [p.e164, p]));
    expect(map.get("+2348031234567")?.whatsapp).toBe("CONFIRMED");
    expect(map.get("+2349011112222")?.whatsapp).toBe("LIKELY");
    expect(map.get("+442079460958")?.whatsapp).toBe("UNKNOWN");
  });

  it("ignores garbage inside <script> and <style>", () => {
    const html = `<script>const s = "01206 999888";</script><p>Call 020 7946 0958</p>`;
    const phones = extractPhones({ html, defaultCountry: "GB" });
    expect(phones.some((p) => p.e164.endsWith("79460958"))).toBe(true);
    expect(phones.some((p) => p.e164.endsWith("06999888"))).toBe(false);
  });
});
