import { describe, expect, it } from "vitest";

import type { ServiceLine } from "@/contracts/common";

import { chooseLeadingLead } from "./detect";
import type { QualifiedLead } from "./crosssell.repo";

function lead(id: string, serviceLine: ServiceLine, score: number | null): QualifiedLead {
  return { id, serviceLine, market: "INTERNATIONAL", score, status: "SCORED", ownerId: null };
}

describe("chooseLeadingLead", () => {
  const noCapacity = new Map<ServiceLine, number>();

  it("picks the highest score", () => {
    const leads = [lead("a", "WEB_DEVELOPMENT", 72), lead("b", "GRAPHIC_DESIGN", 65)];
    expect(chooseLeadingLead(leads, noCapacity)).toBe("a");
  });

  it("breaks a score tie by the line with more free capacity", () => {
    const leads = [lead("a", "WEB_DEVELOPMENT", 70), lead("b", "GRAPHIC_DESIGN", 70)];
    const free = new Map<ServiceLine, number>([
      ["WEB_DEVELOPMENT", 1],
      ["GRAPHIC_DESIGN", 5],
    ]);
    expect(chooseLeadingLead(leads, free)).toBe("b");
  });

  it("breaks a full tie by lead id (stable)", () => {
    const leads = [lead("b", "WEB_DEVELOPMENT", 70), lead("a", "GRAPHIC_DESIGN", 70)];
    expect(chooseLeadingLead(leads, noCapacity)).toBe("a");
  });

  it("treats a null score as lowest", () => {
    const leads = [lead("a", "WEB_DEVELOPMENT", null), lead("b", "GRAPHIC_DESIGN", 10)];
    expect(chooseLeadingLead(leads, noCapacity)).toBe("b");
  });
});
