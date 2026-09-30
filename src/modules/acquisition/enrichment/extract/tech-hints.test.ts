import { describe, expect, it } from "vitest";

import { extractTechHints } from "./tech-hints";

describe("tech-hints extractor", () => {
  it("detects WordPress, jQuery version, copyright year and http-only forms", () => {
    const html = `
      <link href="/wp-content/themes/x/style.css" rel="stylesheet" />
      <script src="/assets/jquery-1.8.3.min.js"></script>
      <form action="http://example.com/submit" method="post"></form>
      <footer>© 2018 Old Design Co</footer>
    `;
    const hints = extractTechHints(html, { isHttps: true });
    expect(hints.platforms).toContain("wordpress");
    expect(hints.jqueryVersion).toBe("1.8.3");
    expect(hints.copyrightYear).toBe(2018);
    expect(hints.legacyTech).toContain("http-only-forms");
    expect(hints.httpsAvailable).toBe(true);
  });

  it("detects Wix and Squarespace via CDN hostnames", () => {
    const wix = extractTechHints(`<img src="https://static.wixstatic.com/media/x.png" />`);
    const sq = extractTechHints(`<link href="https://images.squarespace-cdn.com/x.css" />`);
    expect(wix.platforms).toContain("wix");
    expect(sq.platforms).toContain("squarespace");
  });

  it("picks up a meta generator", () => {
    const html = `<meta name="generator" content="Webflow" />`;
    const hints = extractTechHints(html);
    expect(hints.generator?.toLowerCase()).toContain("webflow");
    expect(hints.platforms).toContain("webflow");
  });
});
