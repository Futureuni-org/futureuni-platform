import { describe, expect, it } from "vitest";

import { EMAIL_TEMPLATES, type EmailTemplateId } from "./index";

describe("email templates", () => {
  it("every template renders {subject, html, text} against its defaultProps", async () => {
    for (const id of Object.keys(EMAIL_TEMPLATES) as EmailTemplateId[]) {
      const template = EMAIL_TEMPLATES[id];
      const rendered = await template.render(template.defaultProps as never);
      expect(rendered.subject, `${id} subject`).toBeTypeOf("string");
      expect(rendered.subject.length, `${id} subject length`).toBeGreaterThan(0);
      expect(rendered.html, `${id} html`).toContain("<html");
      // The brand logo renders from an absolute URL (email clients don't resolve relative paths;
      // it is https in production, http://localhost under test), with alt text so the brand still
      // reads when images are blocked.
      expect(rendered.html, `${id} logo is an absolute img with alt`).toMatch(
        /<img[^>]+src="https?:\/\/[^"]+\/brand\/futureuni-mark\.png"[^>]*alt=/,
      );
      expect(rendered.text, `${id} text`).toBeTypeOf("string");
      expect(rendered.text.length, `${id} text length`).toBeGreaterThan(0);
    }
  });

  it.each(Object.keys(EMAIL_TEMPLATES) as EmailTemplateId[])(
    "plain-text version of %s is snapshot-stable",
    async (id) => {
      const rendered = await EMAIL_TEMPLATES[id].render(EMAIL_TEMPLATES[id].defaultProps as never);
      expect(rendered.text).toMatchSnapshot();
    },
  );
});
