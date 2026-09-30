import { describe, expect, it } from "vitest";

import { planCrawl } from "./plan";

describe("crawl planner", () => {
  it("keeps only same-registrable-domain links, prioritising contact/about/team", () => {
    const html = `
      <a href="/contact">Contact</a>
      <a href="/about">About</a>
      <a href="/team">Team</a>
      <a href="/blog/some-post">Post</a>
      <a href="https://other.example/x">Off-domain</a>
      <a href="https://sub.acme.example/careers">Careers on subdomain</a>
    `;
    const urls = planCrawl(html, { origin: "https://acme.example/", seedDomain: "acme.example", maxPages: 10 });
    expect(urls[0]).toContain("/contact");
    expect(urls).toContain("https://acme.example/about");
    expect(urls).toContain("https://sub.acme.example/careers");
    expect(urls.every((u) => !u.includes("other.example"))).toBe(true);
  });

  it("respects the maxPages cap and dedupes", () => {
    const html = `<a href="/x">a</a><a href="/x">b</a><a href="/y">c</a>`;
    const urls = planCrawl(html, { origin: "https://acme.example/", seedDomain: "acme.example", maxPages: 1 });
    expect(urls).toHaveLength(1);
  });
});
