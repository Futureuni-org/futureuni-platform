/**
 * Phase 20 (SEC-2): the proxy attaches the security-header set — a nonce-based CSP plus the
 * hardening headers — to every response, with a fresh nonce per request.
 */

import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { buildCsp, proxy } from "./proxy";

describe("security headers (SEC-2)", () => {
  it("builds a CSP with a strict script-src and no framing", () => {
    const csp = buildCsp("abc123", false);
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self' 'nonce-abc123' 'strict-dynamic'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).not.toContain("'unsafe-eval'"); // production
  });

  it("allows 'unsafe-eval' only in development (React debug)", () => {
    expect(buildCsp("n", true)).toContain("'unsafe-eval'");
  });

  it("sets every hardening header on the response, with a nonce'd CSP", () => {
    const response = proxy(new NextRequest(new URL("http://localhost/login")));
    const csp = response.headers.get("Content-Security-Policy") ?? "";
    expect(csp).toMatch(/'nonce-[^']+'/);
    expect(csp).toContain("frame-ancestors 'none'");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.get("X-Frame-Options")).toBe("DENY");
    expect(response.headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(response.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
    expect(response.headers.get("Permissions-Policy")).toContain("geolocation=()");
    expect(response.headers.get("Strict-Transport-Security")).toContain("max-age=");
  });

  it("generates a fresh nonce per request", () => {
    const first = proxy(new NextRequest(new URL("http://localhost/login"))).headers.get(
      "Content-Security-Policy",
    );
    const second = proxy(new NextRequest(new URL("http://localhost/login"))).headers.get(
      "Content-Security-Policy",
    );
    expect(first).not.toBe(second);
  });
});
