import { describe, expect, it } from "vitest";

import { FormDefinitionSchema, type FormDefinition } from "@/contracts/forms";

import { briefSections, renderBrief } from "./brief";

const form: FormDefinition = FormDefinitionSchema.parse({
  slug: "test-form",
  title: "Test form",
  intro: ["Why."],
  status: "PUBLISHED",
  version: 1,
  sections: [
    {
      key: "who",
      title: "Your details",
      fields: [
        { key: "name", kind: "shortText", label: "Your name", briefLabel: "Name" },
        { key: "email", kind: "email", label: "Email" },
      ],
    },
    {
      key: "vision",
      title: "Your vision",
      fields: [{ key: "vision", kind: "longText", label: "What do you picture?" }],
    },
  ],
  closing: { title: "Done", body: ["Thanks."] },
});

describe("renderBrief", () => {
  it("uses the brief label when the definition gives one", () => {
    const text = renderBrief(form, { name: "Ada" });
    expect(text).toContain("Name: Ada");
    expect(text).not.toContain("Your name:");
  });

  it("leaves out sections where nothing was answered", () => {
    const text = renderBrief(form, { name: "Ada" });
    expect(text).toContain("YOUR DETAILS");
    expect(text).not.toContain("YOUR VISION");
  });

  it("puts a multi-line answer under its label", () => {
    const text = renderBrief(form, { vision: "Line one\nLine two" });
    expect(text).toContain("What do you picture?:\nLine one\nLine two");
  });

  it("marks unanswered questions only when asked to", () => {
    expect(renderBrief(form, { name: "Ada" })).not.toContain("Not answered");
    const forTheTeam = renderBrief(form, { name: "Ada" }, { includeUnanswered: true });
    expect(forTheTeam).toContain("Email: Not answered");
  });

  it("opens with the title and an optional subtitle", () => {
    const text = renderBrief(form, { name: "Ada" }, { subtitle: "From Ada · 2026-10-16" });
    expect(text.split("\n")[0]).toBe("TEST FORM");
    expect(text).toContain("From Ada · 2026-10-16");
  });

  it("is deterministic, so the prospect's copy and the team's copy match", () => {
    expect(renderBrief(form, { name: "Ada" })).toBe(renderBrief(form, { name: "Ada" }));
  });
});

describe("briefSections", () => {
  it("keeps every question, with null for the ones left blank", () => {
    const sections = briefSections(form, { name: "Ada" });
    expect(sections).toHaveLength(2);
    expect(sections[0]?.rows.map((row) => row.value)).toEqual(["Ada", null]);
    expect(sections[1]?.rows[0]?.value).toBeNull();
  });

  it("labels rows with the question as the prospect read it", () => {
    const sections = briefSections(form, {});
    expect(sections[0]?.rows[0]?.label).toBe("Your name");
  });
});
