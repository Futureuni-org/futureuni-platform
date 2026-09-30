import { describe, expect, it } from "vitest";

import { isPathAllowed, parse } from "./robots";

const ROBOTS = `# comment
User-agent: *
Disallow: /admin/
Disallow: /*.pdf$
Allow: /admin/public/

User-agent: FUTUREUNI-Bot
Disallow: /internal/
Allow: /
`;

describe("robots.txt parser", () => {
  it("parses grouped user-agents", () => {
    const rules = parse(ROBOTS);
    expect(rules.get("*")).toHaveLength(3);
    expect(rules.get("futureuni-bot")).toHaveLength(2);
  });

  it("matches longest-pattern wins (Google-compatible)", () => {
    const rules = parse(ROBOTS);
    expect(isPathAllowed("/admin/", rules, "GenericBot")).toBe(false);
    expect(isPathAllowed("/admin/public/index", rules, "GenericBot")).toBe(true);
  });

  it("supports $ end-of-path anchor and * wildcard", () => {
    const rules = parse(ROBOTS);
    expect(isPathAllowed("/foo.pdf", rules, "GenericBot")).toBe(false);
    expect(isPathAllowed("/foo.pdf?x=1", rules, "GenericBot")).toBe(true); // anchor
    expect(isPathAllowed("/foo.html", rules, "GenericBot")).toBe(true);
  });

  it("picks the most specific agent group and falls back to *", () => {
    const rules = parse(ROBOTS);
    // FUTUREUNI-Bot has its own group; /admin/ is not blocked for it.
    expect(isPathAllowed("/admin/", rules, "FUTUREUNI-Bot/1.0")).toBe(true);
    // The internal path is blocked for us specifically.
    expect(isPathAllowed("/internal/x", rules, "FUTUREUNI-Bot/1.0")).toBe(false);
    // A generic bot falls back to '*'.
    expect(isPathAllowed("/admin/x", rules, "GenericBot")).toBe(false);
  });

  it("empty and missing robots.txt allow everything", () => {
    const empty = parse("");
    expect(isPathAllowed("/anything", empty, "any")).toBe(true);
  });
});
