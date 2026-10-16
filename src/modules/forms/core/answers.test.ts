import { describe, expect, it } from "vitest";

import { FormDefinitionSchema, type FormDefinition } from "@/contracts/forms";

import {
  answerToText,
  answeredCount,
  answersByteLength,
  missingRequired,
  normalizeAnswers,
  questionCount,
} from "./answers";

const form: FormDefinition = FormDefinitionSchema.parse({
  slug: "test-form",
  title: "Test form",
  intro: ["Why."],
  status: "PUBLISHED",
  version: 2,
  sections: [
    {
      key: "who",
      title: "Who",
      fields: [
        { key: "name", kind: "shortText", label: "Name", required: true },
        { key: "email", kind: "email", label: "Email" },
      ],
    },
    {
      key: "what",
      title: "What",
      fields: [
        {
          key: "shape",
          kind: "singleChoice",
          label: "Shape",
          required: true,
          choices: [
            { value: "Wide", label: "Wide" },
            { value: "Tall", label: "Tall" },
          ],
        },
        {
          key: "style",
          kind: "multiChoice",
          label: "Style",
          choices: [
            { value: "Dark", label: "Dark" },
            { value: "Bright", label: "Bright" },
          ],
        },
      ],
    },
  ],
  closing: { title: "Done", body: ["Thanks."] },
});

describe("normalizeAnswers", () => {
  it("keeps only the fields the definition declares", () => {
    const answers = normalizeAnswers(form, { name: "Ada", sneaky: "drop me" });
    expect(answers).toEqual({ name: "Ada" });
  });

  it("trims text and drops answers that are only whitespace", () => {
    expect(normalizeAnswers(form, { name: "  Ada  ", email: "   " })).toEqual({ name: "Ada" });
  });

  it("rejects a single choice that isn't one of the options", () => {
    expect(normalizeAnswers(form, { shape: "Square" })).toEqual({});
    expect(normalizeAnswers(form, { shape: "Tall" })).toEqual({ shape: "Tall" });
  });

  it("filters a multi-choice to declared values and de-duplicates it", () => {
    expect(normalizeAnswers(form, { style: ["Dark", "Dark", "Neon"] })).toEqual({
      style: ["Dark"],
    });
  });

  it("drops a multi-choice that is sent as text, and text sent as a list", () => {
    expect(normalizeAnswers(form, { style: "Dark", name: ["Ada"] })).toEqual({});
  });

  it("survives junk input", () => {
    expect(normalizeAnswers(form, null)).toEqual({});
    expect(normalizeAnswers(form, "nope")).toEqual({});
    expect(normalizeAnswers(form, [1, 2, 3])).toEqual({});
  });

  it("caps a long text answer", () => {
    const answers = normalizeAnswers(form, { name: "x".repeat(6_000) });
    expect(answerToText(answers.name)).toHaveLength(5_000);
  });
});

describe("counting", () => {
  it("counts every question once", () => {
    expect(questionCount(form)).toBe(4);
  });

  it("counts only answers that carry something", () => {
    expect(answeredCount(form, {})).toBe(0);
    expect(answeredCount(form, { name: "Ada", email: "", style: [] })).toBe(1);
    expect(answeredCount(form, { name: "Ada", shape: "Wide" })).toBe(2);
  });
});

describe("missingRequired", () => {
  it("lists unanswered required questions in the order they appear", () => {
    expect(missingRequired(form, {}).map((field) => field.key)).toEqual(["name", "shape"]);
  });

  it("is empty once every required question has an answer", () => {
    expect(missingRequired(form, { name: "Ada", shape: "Wide" })).toHaveLength(0);
  });

  it("does not count a whitespace-only answer", () => {
    expect(missingRequired(form, { name: "  ", shape: "Wide" }).map((f) => f.key)).toEqual([
      "name",
    ]);
  });
});

describe("answerToText", () => {
  it("joins a list and passes text through", () => {
    expect(answerToText(["a", "b"])).toBe("a, b");
    expect(answerToText("a")).toBe("a");
    expect(answerToText(undefined)).toBe("");
  });
});

describe("answersByteLength", () => {
  it("measures the serialised payload, not the character count", () => {
    expect(answersByteLength({ name: "Ada" })).toBe(JSON.stringify({ name: "Ada" }).length);
    // A multi-byte character costs more than one byte.
    expect(answersByteLength({ name: "₦" })).toBeGreaterThan(JSON.stringify({ name: "x" }).length);
  });
});
