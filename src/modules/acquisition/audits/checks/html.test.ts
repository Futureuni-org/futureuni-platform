import { describe, expect, it } from "vitest";

import {
  countH1,
  extractCopyrightYear,
  extractInternalLinks,
  extractMetaDescription,
  extractOgImage,
  extractTitle,
  hasHttpForm,
  hasOpenGraph,
  hasViewportMeta,
  legacyTechHints,
} from "./html";

const PAGE = `<!doctype html><html><head>
  <title> Acme Ltd </title>
  <meta name="description" content="We sell cakes.">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta property="og:image" content="https://acme.example/og.png">
  <link rel="icon" href="/favicon.ico">
</head><body>
  <h1>Welcome</h1>
  <a href="/contact">Contact</a>
  <a href="/about">About</a>
  <a href="https://other.example/x">Off</a>
  <a href="mailto:x@acme.example">Mail</a>
  <footer>© 2019 Acme</footer>
</body></html>`;

describe("html inspectors", () => {
  it("extracts title, description, og image and viewport", () => {
    expect(extractTitle(PAGE)).toBe("Acme Ltd");
    expect(extractMetaDescription(PAGE)).toBe("We sell cakes.");
    expect(extractOgImage(PAGE)).toBe("https://acme.example/og.png");
    expect(hasViewportMeta(PAGE)).toBe(true);
    expect(hasOpenGraph(PAGE)).toBe(true);
  });

  it("counts a single H1", () => {
    expect(countH1(PAGE)).toBe(1);
    expect(countH1("<h1>a</h1><h1>b</h1>")).toBe(2);
    expect(countH1("<p>no heading</p>")).toBe(0);
  });

  it("keeps only same-host internal links (no mailto/off-domain)", () => {
    const links = extractInternalLinks(PAGE, "https://acme.example/");
    expect(links).toContain("https://acme.example/contact");
    expect(links).toContain("https://acme.example/about");
    expect(links.every((l) => !l.includes("other.example"))).toBe(true);
    expect(links.every((l) => !l.startsWith("mailto:"))).toBe(true);
  });

  it("reads the most recent copyright year", () => {
    expect(extractCopyrightYear(PAGE)).toBe(2019);
    expect(extractCopyrightYear("© 2020-2026 Co")).toBe(2026);
    expect(extractCopyrightYear("no year")).toBeNull();
  });

  it("flags http forms and legacy tech", () => {
    expect(hasHttpForm('<form action="http://x.example/post">')).toBe(true);
    expect(hasHttpForm('<form action="https://x.example/post">')).toBe(false);
    expect(legacyTechHints('<script src="jquery-1.11.js"></script>')).toContain("jQuery 1.x");
    expect(legacyTechHints("<font>hi</font>")).toContain("<font> tags");
    expect(legacyTechHints("<p>modern</p>")).toHaveLength(0);
  });

  it("returns null for missing fields", () => {
    expect(extractTitle("<p>no title</p>")).toBeNull();
    expect(extractMetaDescription("<p>no desc</p>")).toBeNull();
    expect(hasViewportMeta("<head></head>")).toBe(false);
  });
});
