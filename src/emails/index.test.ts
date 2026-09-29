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
