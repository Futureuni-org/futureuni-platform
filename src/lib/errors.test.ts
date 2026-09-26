import { describe, expect, it } from "vitest";

import { APP_ERROR_STATUS, AppError, errorResponse, toAppError } from "@/lib/errors";
import { err, ok } from "@/lib/result";

describe("AppError", () => {
  it("takes its HTTP status from the code", () => {
    expect(new AppError("FORBIDDEN").status).toBe(403);
    expect(new AppError("INVALID_TRANSITION").status).toBe(409);
    expect(new AppError("AI_TIMEOUT").status).toBe(504);
  });

  it("uses a safe default message and keeps details", () => {
    const error = new AppError("VALIDATION_FAILED", undefined, {
      details: { fields: { email: "Required" } },
    });
    expect(error.message).toBe("Some details need correcting.");
    expect(error.toShape()).toEqual({
      code: "VALIDATION_FAILED",
      message: "Some details need correcting.",
      status: 422,
      details: { fields: { email: "Required" } },
    });
  });

  it("maps every code to a 4xx or 5xx status", () => {
    for (const status of Object.values(APP_ERROR_STATUS)) {
      expect(status).toBeGreaterThanOrEqual(400);
      expect(status).toBeLessThan(600);
    }
  });
});

describe("toAppError", () => {
  it("turns an unknown error into INTERNAL without exposing its message", () => {
    const error = toAppError(new Error("connect ECONNREFUSED 10.0.0.5:5432"));
    expect(error.code).toBe("INTERNAL");
    expect(error.message).not.toContain("ECONNREFUSED");
  });
});

describe("errorResponse", () => {
  it("responds with the code's status and the error body, and no internals", async () => {
    const response = errorResponse(new Error("secret stack detail"));
    expect(response.status).toBe(500);
    const body: unknown = await response.json();
    expect(body).toEqual({
      error: { code: "INTERNAL", message: "Something went wrong on our side." },
    });
    expect(JSON.stringify(body)).not.toContain("secret stack detail");
  });
});

describe("ActionResult helpers", () => {
  it("wraps data and errors", () => {
    expect(ok({ id: "c1" })).toEqual({ ok: true, data: { id: "c1" } });
    expect(err(new AppError("NOT_FOUND"))).toEqual({
      ok: false,
      error: { code: "NOT_FOUND", message: "We couldn't find that." },
    });
  });
});
