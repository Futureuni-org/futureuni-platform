import { describe, expect, it } from "vitest";

import { buildWhatsAppLink } from "./links";

describe("buildWhatsAppLink", () => {
  it("builds a wa.me link with the E.164 digits and url-encoded text", () => {
    const url = buildWhatsAppLink({ text: "FUTUREUNI here", to: "+2348031234567" });
    expect(url).toBe("https://wa.me/2348031234567?text=FUTUREUNI%20here");
  });

  it("encodes newlines", () => {
    const url = buildWhatsAppLink({ text: "FUTUREUNI\nSecond line", to: "+2348031234567" });
    expect(url).toContain("FUTUREUNI%0ASecond%20line");
    expect(url).not.toContain("\n");
  });

  it("strips non-digit characters from the number", () => {
    const url = buildWhatsAppLink({ text: "Hi", to: "+234 803 123 4567" });
    expect(url.startsWith("https://wa.me/2348031234567?text=")).toBe(true);
  });
});
