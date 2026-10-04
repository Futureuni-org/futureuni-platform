import { describe, expect, it } from "vitest";

import { autoMap } from "./csv-mapping";

describe("CSV autoMap", () => {
  it("maps common header names to fields, ignoring case and punctuation", () => {
    expect(autoMap(["Company Name", "Web Site", "E-Mail", "Phone"])).toEqual({
      "Company Name": "companyName",
      "Web Site": "website",
      "E-Mail": "email",
      Phone: "phone",
    });
  });

  it("leaves unknown columns unmapped", () => {
    expect(autoMap(["Revenue", "Notes"])).toEqual({ Notes: "notes" });
  });
});
