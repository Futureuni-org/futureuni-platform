import { describe, expect, it } from "vitest";

import { formatNoteCount } from "./example";

describe("formatNoteCount", () => {
  it("uses the singular for one note", () => {
    expect(formatNoteCount(1)).toBe("1 note");
  });

  it("uses the plural otherwise", () => {
    expect(formatNoteCount(0)).toBe("0 notes");
    expect(formatNoteCount(12)).toBe("12 notes");
  });
});
