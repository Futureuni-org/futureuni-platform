import { beforeEach, describe, expect, it, vi } from "vitest";

import { verifyBackupAction, verifyTotpAction } from "./actions";

/**
 * The 2FA verify actions sit between the code form and Better Auth. What matters here is the
 * contract they add: the code is validated before the library is called, the "trust this device"
 * checkbox is forwarded as `trustDevice` on both the TOTP and backup-code paths, and a rejected
 * code comes back as UNAUTHENTICATED. The library itself is replaced; its cookie handling is
 * covered by the e2e suite.
 */

const api = vi.hoisted(() => ({
  verifyTOTP: vi.fn(),
  verifyBackupCode: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: () => Promise.resolve(new Headers()),
}));
vi.mock("@/platform/auth", () => ({
  auth: { api },
  safeNext: (next: string) => next,
}));

function form(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.set(key, value);
  return data;
}

beforeEach(() => {
  api.verifyTOTP.mockReset().mockResolvedValue(new Response(null, { status: 200 }));
  api.verifyBackupCode.mockReset().mockResolvedValue(new Response(null, { status: 200 }));
});

describe("verifyTotpAction", () => {
  it("forwards trustDevice: true when the checkbox is ticked", async () => {
    const result = await verifyTotpAction(form({ code: "123456", trustDevice: "on", next: "/leads" }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.redirect).toBe("/leads");
    expect(api.verifyTOTP).toHaveBeenCalledWith(
      expect.objectContaining({ body: { code: "123456", trustDevice: true } }),
    );
  });

  it("forwards trustDevice: false when the checkbox is unticked", async () => {
    await verifyTotpAction(form({ code: "123456" }));
    expect(api.verifyTOTP).toHaveBeenCalledWith(
      expect.objectContaining({ body: { code: "123456", trustDevice: false } }),
    );
  });

  it("rejects a malformed code without calling the library", async () => {
    const result = await verifyTotpAction(form({ code: "12345" }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("VALIDATION_FAILED");
    expect(api.verifyTOTP).not.toHaveBeenCalled();
  });

  it("returns UNAUTHENTICATED when the library rejects the code", async () => {
    api.verifyTOTP.mockResolvedValue(new Response(null, { status: 401 }));
    const result = await verifyTotpAction(form({ code: "123456", trustDevice: "on" }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("UNAUTHENTICATED");
  });
});

describe("verifyBackupAction", () => {
  it("forwards trustDevice: true when the checkbox is ticked", async () => {
    const result = await verifyBackupAction(form({ code: "abcd-efgh-ij", trustDevice: "on" }));
    expect(result.ok).toBe(true);
    expect(api.verifyBackupCode).toHaveBeenCalledWith(
      expect.objectContaining({ body: { code: "abcd-efgh-ij", trustDevice: true } }),
    );
  });

  it("forwards trustDevice: false when the checkbox is unticked", async () => {
    await verifyBackupAction(form({ code: "abcd-efgh-ij" }));
    expect(api.verifyBackupCode).toHaveBeenCalledWith(
      expect.objectContaining({ body: { code: "abcd-efgh-ij", trustDevice: false } }),
    );
  });
});
