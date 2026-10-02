import { describe, expect, it } from "vitest";

import { htmlToText } from "./html-to-text";

describe("htmlToText", () => {
  it("strips tags and decodes entities", () => {
    expect(htmlToText("<p>Hello &amp; welcome</p>")).toBe("Hello & welcome");
  });

  it("turns <br> and block ends into line breaks", () => {
    expect(htmlToText("<div>Line one<br>Line two</div>")).toBe("Line one\nLine two");
  });

  it("drops script and style content", () => {
    expect(htmlToText("<style>p{color:red}</style><p>Visible</p><script>alert(1)</script>")).toBe("Visible");
  });

  it("preserves an anchor's href in parentheses", () => {
    const out = htmlToText('<a href="https://ex.example/u/abc">unsubscribe</a>');
    expect(out).toContain("unsubscribe");
    expect(out).toContain("https://ex.example/u/abc");
  });

  it("keeps mailto anchors as their label only", () => {
    expect(htmlToText('<a href="mailto:x@y.example">email us</a>')).toBe("email us");
  });

  it("collapses excess blank lines", () => {
    expect(htmlToText("<p>A</p><p></p><p></p><p>B</p>")).toBe("A\n\nB");
  });
});
