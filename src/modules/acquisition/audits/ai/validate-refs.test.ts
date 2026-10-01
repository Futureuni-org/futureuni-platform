import { describe, expect, it, vi } from "vitest";

import { keepFindingsWithKnownRefs } from "./validate-refs";
import type { AuditAiFinding } from "./schemas";

function finding(evidenceRefs: string[]): AuditAiFinding {
  return { claim: "A clear, specific claim about the page.", evidenceRefs, severity: "MEDIUM", confidence: 0.8 };
}

describe("keepFindingsWithKnownRefs (contract rule 3)", () => {
  it("keeps findings whose references are all in the input", () => {
    const log = { warn: vi.fn() };
    const kept = keepFindingsWithKnownRefs([finding(["a", "b"])], ["a", "b", "c"], log);
    expect(kept).toHaveLength(1);
    expect(log.warn).not.toHaveBeenCalled();
  });

  it("drops and logs a finding that cites a reference not in the input (INV-18/INV-24)", () => {
    const log = { warn: vi.fn() };
    const kept = keepFindingsWithKnownRefs([finding(["a", "invented"])], ["a"], log);
    expect(kept).toHaveLength(0);
    expect(log.warn).toHaveBeenCalledTimes(1);
  });

  it("keeps the valid finding and drops the invalid one in a mixed batch", () => {
    const log = { warn: vi.fn() };
    const kept = keepFindingsWithKnownRefs([finding(["x"]), finding(["y", "z"])], ["x", "y"], log);
    expect(kept).toHaveLength(1);
    expect(kept[0]?.evidenceRefs).toEqual(["x"]);
  });
});
