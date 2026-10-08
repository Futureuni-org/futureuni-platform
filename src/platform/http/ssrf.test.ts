import { describe, expect, it } from "vitest";

import { guardUrl, isPrivateAddress } from "./ssrf";

describe("SSRF guard", () => {
  it("blocks IPv4 loopback and private ranges", () => {
    expect(isPrivateAddress("127.0.0.1")).toBe(true);
    expect(isPrivateAddress("10.0.0.5")).toBe(true);
    expect(isPrivateAddress("172.16.0.1")).toBe(true);
    expect(isPrivateAddress("172.31.255.254")).toBe(true);
    expect(isPrivateAddress("192.168.0.1")).toBe(true);
    expect(isPrivateAddress("169.254.169.254")).toBe(true); // AWS metadata
    expect(isPrivateAddress("0.0.0.0")).toBe(true);
    expect(isPrivateAddress("255.255.255.255")).toBe(true);
  });

  it("allows public IPv4 addresses", () => {
    expect(isPrivateAddress("1.1.1.1")).toBe(false);
    expect(isPrivateAddress("8.8.8.8")).toBe(false);
    expect(isPrivateAddress("142.250.190.14")).toBe(false);
  });

  it("blocks IPv6 loopback, ULA, link-local and IPv4-mapped private", () => {
    expect(isPrivateAddress("::1")).toBe(true);
    expect(isPrivateAddress("fc00::1")).toBe(true);
    expect(isPrivateAddress("fd12:3456:789a::1")).toBe(true);
    expect(isPrivateAddress("fe80::1")).toBe(true);
    expect(isPrivateAddress("::ffff:10.0.0.1")).toBe(true);
    expect(isPrivateAddress("::ffff:169.254.169.254")).toBe(true);
  });

  it("allows public IPv6 addresses", () => {
    expect(isPrivateAddress("2606:4700:4700::1111")).toBe(false); // Cloudflare
    expect(isPrivateAddress("2001:4860:4860::8888")).toBe(false); // Google DNS
  });

  it("guardUrl refuses invalid URLs, unusual schemes and ports", async () => {
    expect(await guardUrl("not a url")).toMatchObject({ ok: false, reason: "ssrf" });
    expect(await guardUrl("file:///etc/passwd")).toMatchObject({ ok: false });
    expect(await guardUrl("gopher://example.com")).toMatchObject({ ok: false });
    expect(await guardUrl("http://example.com:22")).toMatchObject({ ok: false });
  });

  it("guardUrl refuses URLs whose hostname resolves to a private IP", async () => {
    // localhost resolves to 127.0.0.1 (or ::1) on every platform Node runs on.
    expect(await guardUrl("http://localhost/")).toMatchObject({ ok: false, reason: "ssrf" });
    expect(await guardUrl("http://127.0.0.1/")).toMatchObject({ ok: false });
    expect(await guardUrl("http://[::1]/")).toMatchObject({ ok: false });
    expect(await guardUrl("http://169.254.169.254/latest/meta-data/")).toMatchObject({ ok: false });
    // SEC-4: IPv6 metadata / IPv4-mapped metadata must also be blocked (DNS-rebinding redirects
    // re-run this guard on each hop, so a public→private rebind is caught here too).
    expect(await guardUrl("http://[fd00:ec2::254]/latest/meta-data/")).toMatchObject({ ok: false });
    expect(await guardUrl("http://[::ffff:169.254.169.254]/")).toMatchObject({ ok: false });
  });

  it("guardUrl accepts a public IPv4 and IPv6 literal", async () => {
    expect(await guardUrl("http://1.1.1.1/")).toMatchObject({
      ok: true,
      resolvedIps: ["1.1.1.1"],
    });
    // The bracketed IPv6 host must be checked as a literal, never sent to the resolver: a
    // resolver that refuses the brackets would wrongly refuse every public IPv6 address.
    expect(await guardUrl("https://[2606:4700:4700::1111]/")).toMatchObject({
      ok: true,
      resolvedIps: ["2606:4700:4700::1111"],
    });
  });
});
