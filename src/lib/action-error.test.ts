import { afterEach, describe, expect, it, vi } from "vitest";

import { AppError } from "@/lib/errors";

import { failedAction } from "./action-error";

/**
 * The contract of a server action's catch block: a framework signal (the sign-in redirect
 * `requireUser()` throws when a session expires) must travel on untouched, and anything else must
 * be logged before it is flattened into the generic INTERNAL message the user sees.
 */

afterEach(() => {
  vi.restoreAllMocks();
});

/** What `redirect()` throws: Next.js identifies it by this digest. */
function redirectError(): Error {
  const error = new Error("NEXT_REDIRECT");
  (error as Error & { digest: string }).digest = "NEXT_REDIRECT;replace;/login;307;";
  return error;
}

describe("failedAction", () => {
  it("rethrows a redirect so an expired session reaches the sign-in page", () => {
    const error = redirectError();
    expect(() => failedAction(error, { action: "updateOwnProfileAction" })).toThrow(error);
  });

  it("logs the cause of an unexpected error and returns INTERNAL", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const result = failedAction(new TypeError("fetch failed"), { action: "uploadAvatarAction" });

    expect(result).toMatchObject({ ok: false, error: { code: "INTERNAL" } });
    expect(spy).toHaveBeenCalledTimes(1);
    const logged = JSON.parse(String(spy.mock.calls[0]?.[0])) as Record<string, unknown>;
    expect(logged).toMatchObject({
      level: "error",
      msg: "fetch failed",
      name: "TypeError",
      action: "uploadAvatarAction",
    });
  });

  it("keeps an AppError's own code and message", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const result = failedAction(new AppError("PAYLOAD_TOO_LARGE", "File is too big."), {
      action: "uploadAvatarAction",
    });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "PAYLOAD_TOO_LARGE", message: "File is too big." },
    });
  });
});
