import { describe, expect, it } from "vitest";

import { mockVerifier } from "./mock";

describe("mock email verifier", () => {
  it("marks disposable as INVALID", async () => {
    const result = await mockVerifier.verify("test@mailinator.com");
    expect(result.status).toBe("INVALID");
    expect(result.flags.disposable).toBe(true);
  });

  it("marks webmail and role as RISKY", async () => {
    expect((await mockVerifier.verify("ada@gmail.com")).status).toBe("RISKY");
    expect((await mockVerifier.verify("info@acme.example")).status).toBe("RISKY");
  });

  it("marks a plain business address as VALID", async () => {
    expect((await mockVerifier.verify("ada@acme.example")).status).toBe("VALID");
  });
});
