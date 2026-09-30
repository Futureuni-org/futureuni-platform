import { describe, expect, it } from "vitest";

import { extractSocials } from "./socials";

describe("socials extractor", () => {
  it("captures common platforms; keeps LinkedIn only when it's a /company/ URL", () => {
    const html = `
      <a href="https://instagram.com/ada">IG</a>
      <a href="https://www.facebook.com/ada">FB</a>
      <a href="https://www.linkedin.com/in/ada-lovelace/">personal</a>
      <a href="https://www.linkedin.com/company/ada-labs">company</a>
      <a href="https://x.com/ada">X</a>
      <a href="https://www.tiktok.com/@ada">TikTok</a>
      <a href="https://youtu.be/xyz">YouTube</a>
      <a href="https://wa.me/2348031234567">WA</a>
      <a href="https://www.behance.net/ada">Behance</a>
      <a href="https://dribbble.com/ada">Dribbble</a>
    `;
    const socials = extractSocials(html);
    expect(socials.instagram).toContain("instagram.com/ada");
    expect(socials.facebook).toContain("facebook.com/ada");
    expect(socials.linkedin).toContain("/company/ada-labs");
    expect(socials.x).toContain("x.com/ada");
    expect(socials.tiktok).toContain("tiktok.com/@ada");
    expect(socials.youtube).toContain("youtu.be/xyz");
    expect(socials.whatsapp).toContain("wa.me/2348031234567");
    expect(socials.behance).toContain("behance.net/ada");
    expect(socials.dribbble).toContain("dribbble.com/ada");
  });

  it("ignores non-http URLs", () => {
    const html = `<a href="mailto:x@example.com">x</a>`;
    expect(Object.keys(extractSocials(html))).toHaveLength(0);
  });
});
