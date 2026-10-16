import { describe, expect, it } from "vitest";

import { FormDefinitionSchema, formFields } from "@/contracts/forms";

import { getForm, getPublishedForm, listForms } from ".";

/**
 * The registry validates every definition on first read, so these tests are the gate that stops a
 * broken form reaching a prospect: a bad definition fails here, not in their browser.
 */
describe("the form registry", () => {
  it("serves at least one form, and every one of them is valid", () => {
    const forms = listForms();
    expect(forms.length).toBeGreaterThan(0);
    for (const form of forms) {
      expect(FormDefinitionSchema.safeParse(form).success).toBe(true);
    }
  });

  it("gives every form a unique slug", () => {
    const slugs = listForms().map((form) => form.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("looks a form up by slug, and returns undefined for one that doesn't exist", () => {
    expect(getForm("ai-music-video-brief")?.title).toBe("AI Music Video Brief");
    expect(getForm("not-a-form")).toBeUndefined();
  });

  it("serves only published forms publicly", () => {
    for (const form of listForms()) {
      const published = getPublishedForm(form.slug);
      if (form.status === "PUBLISHED") expect(published?.slug).toBe(form.slug);
      else expect(published).toBeUndefined();
    }
  });
});

describe("the AI music video brief", () => {
  const found = getForm("ai-music-video-brief");
  if (found === undefined) throw new Error("The music video brief is missing from the registry.");
  const form = found;

  it("is published, and tagged to the video line", () => {
    expect(form.status).toBe("PUBLISHED");
    expect(form.serviceLine).toBe("VIDEO_EDITING");
  });

  it("asks the eight questions we cannot start without", () => {
    const required = formFields(form)
      .filter((field) => field.required === true)
      .map((field) => field.key);
    expect(required).toEqual([
      "yourName",
      "artistName",
      "email",
      "phone",
      "songTitle",
      "trackLink",
      "trackStatus",
      "appearance",
    ]);
  });

  it("names a way to reach us, in case sending fails", () => {
    expect(form.closing.email).toBeDefined();
    expect(form.closing.whatsapp).toBeDefined();
  });

  it("knows who the brief came from, for the submissions list", () => {
    const roles = formFields(form)
      .map((field) => field.role)
      .filter((role) => role !== undefined);
    expect(roles).toContain("contactName");
    expect(roles).toContain("contactEmail");
  });
});
