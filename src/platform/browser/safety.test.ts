import { afterEach, describe, expect, it } from "vitest";

import { _resetRobotsCache, configureSsrf, setRobotsFetcher } from "@/platform/http";

import {
  assertActionsAreNavigationOnly,
  guardCaptureUrl,
  UnsafeActionError,
} from "./safety";
import type { NormalizedCaptureRequest } from "./types";

type Actions = NormalizedCaptureRequest["actions"];

afterEach(() => {
  configureSsrf();
  _resetRobotsCache();
});

describe("assertActionsAreNavigationOnly", () => {
  it("accepts navigation and scroll actions", () => {
    const actions: Actions = [
      { type: "click-text", text: "Sign up" },
      { type: "scroll", px: 400 },
    ];
    expect(() => {
      assertActionsAreNavigationOnly(actions);
    }).not.toThrow();
  });

  it("rejects typing or form submission (no non-navigation action is allowed)", () => {
    const forged = [{ type: "fill", selector: "#email", value: "x@y.z" }] as unknown as Actions;
    expect(() => {
      assertActionsAreNavigationOnly(forged);
    }).toThrow(UnsafeActionError);
  });

  it("rejects an empty click-text target", () => {
    expect(() => {
      assertActionsAreNavigationOnly([{ type: "click-text", text: "   " }]);
    }).toThrow(UnsafeActionError);
  });
});

describe("guardCaptureUrl (SSRF + robots run before any capture)", () => {
  it("blocks a private/loopback address (SSRF)", async () => {
    const result = await guardCaptureUrl("http://127.0.0.1/");
    expect(result).toEqual({ allowed: false, reason: "ssrf" });
  });

  it("blocks a URL disallowed by robots.txt", async () => {
    configureSsrf({ trustHostnames: ["blocked.example"] });
    setRobotsFetcher(() =>
      Promise.resolve({ ok: true, status: 200, body: "User-agent: *\nDisallow: /" }),
    );
    const result = await guardCaptureUrl("https://blocked.example/pricing");
    expect(result).toEqual({ allowed: false, reason: "robots" });
  });

  it("allows a public URL that robots permits", async () => {
    configureSsrf({ trustHostnames: ["ok.example"] });
    setRobotsFetcher(() =>
      Promise.resolve({ ok: true, status: 200, body: "User-agent: *\nDisallow:" }),
    );
    const result = await guardCaptureUrl("https://ok.example/");
    expect(result).toEqual({ allowed: true });
  });
});
