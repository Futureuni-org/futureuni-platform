import { describe, expect, it } from "vitest";

import { cn } from "@/lib/cn";

describe("cn", () => {
  it("joins conditional classes", () => {
    expect(cn("px-4", false, undefined, ["py-2", { "font-semibold": true, hidden: false }])).toBe(
      "px-4 py-2 font-semibold",
    );
  });

  it("lets the later token class win", () => {
    expect(cn("bg-surface", "bg-primary")).toBe("bg-primary");
    expect(cn("text-muted", "text-heading")).toBe("text-heading");
    expect(cn("shadow-soft", "shadow-lift")).toBe("shadow-lift");
    expect(cn("duration-fast", "duration-slow")).toBe("duration-slow");
    expect(cn("ease-standard", "ease-exit")).toBe("ease-exit");
    expect(cn("font-sans", "font-display")).toBe("font-display");
  });

  it("keeps an elevation and a shadow colour apart", () => {
    expect(cn("shadow-lift", "shadow-primary")).toBe("shadow-lift shadow-primary");
  });
});
