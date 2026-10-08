/**
 * SSRF protection for `safeFetch` (Phase 9, `docs/contracts/enrichment.md` §3 rule 1).
 *
 * Every fetch resolves the hostname and rejects any address that isn't a routable public
 * unicast address. Private, loopback, link-local, multicast, broadcast and cloud metadata
 * addresses (`169.254.169.254`, `fd00:ec2::254`) are refused, in IPv4 and IPv6. The guard is
 * re-run after every redirect so an attacker can't dodge it with a public → private redirect
 * (DNS rebinding via `301`).
 *
 * Only `http:` and `https:` are allowed. Ports outside the small allowlist (80, 443, 8080, 8443)
 * are refused unless `SSRF_ALLOWED_PORTS` is extended by tests via `configureSsrf`.
 */

import "server-only";

import { isIP, isIPv4, isIPv6 } from "node:net";
import { lookup } from "node:dns/promises";

const IPV4_PRIVATE = [
  ["10.0.0.0", 8],
  ["172.16.0.0", 12],
  ["192.168.0.0", 16],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16], // link-local + AWS/EC2 metadata (169.254.169.254)
  ["100.64.0.0", 10], // shared address space
  ["192.0.0.0", 24], // IETF special-use
  ["192.0.2.0", 24], // TEST-NET-1
  ["198.18.0.0", 15], // benchmarking
  ["198.51.100.0", 24], // TEST-NET-2
  ["203.0.113.0", 24], // TEST-NET-3
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reserved
  ["255.255.255.255", 32], // broadcast
  ["0.0.0.0", 8],
] as const;

const IPV6_PRIVATE_PREFIXES: readonly string[] = [
  "::1", // loopback
  "::", // unspecified
  "::ffff:", // IPv4-mapped: v4 rules apply after unmapping
  "fc", // fc00::/7 unique-local (fc, fd start)
  "fd",
  "fe80", // link-local
  "fec0", // deprecated site-local
  "ff", // multicast
  "2001:db8", // documentation
  "64:ff9b:", // NAT64
  "100::", // discard
];

const DEFAULT_ALLOWED_PORTS: ReadonlySet<number> = new Set([80, 443, 8080, 8443]);
const DEFAULT_ALLOWED_PROTOCOLS: ReadonlySet<string> = new Set(["http:", "https:"]);

let allowedPorts = new Set(DEFAULT_ALLOWED_PORTS);
let trustedHostnames = new Set<string>();

/**
 * Test-only: expand or restore the SSRF configuration.
 *  - `extraPorts`: additional ports to allow.
 *  - `trustHostnames`: hostnames to treat as public without doing DNS. MSW-mocked test URLs go
 *    here so tests can exercise `safeFetch` without touching real DNS.
 */
export function configureSsrf(opts?: { extraPorts?: readonly number[]; trustHostnames?: readonly string[] }): void {
  allowedPorts = new Set(DEFAULT_ALLOWED_PORTS);
  trustedHostnames = new Set();
  if (opts?.extraPorts !== undefined) for (const port of opts.extraPorts) allowedPorts.add(port);
  if (opts?.trustHostnames !== undefined) for (const host of opts.trustHostnames) trustedHostnames.add(host.toLowerCase());
}

export function _trustedHostnames(): ReadonlySet<string> {
  return trustedHostnames;
}

export interface SsrfCheckError {
  ok: false;
  reason: "ssrf";
  message: string;
}
export interface SsrfCheckOk {
  ok: true;
  resolvedIps: string[];
}

/**
 * Validate a URL's protocol and port, resolve its hostname, and refuse anything that maps to a
 * non-public address. If the hostname is already an IP literal, only that literal is checked.
 */
export async function guardUrl(url: string): Promise<SsrfCheckOk | SsrfCheckError> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, reason: "ssrf", message: "Invalid URL." };
  }
  if (!DEFAULT_ALLOWED_PROTOCOLS.has(parsed.protocol)) {
    return { ok: false, reason: "ssrf", message: `Protocol not allowed: ${parsed.protocol}` };
  }
  const port = parsed.port === "" ? (parsed.protocol === "https:" ? 443 : 80) : Number.parseInt(parsed.port, 10);
  if (!Number.isFinite(port) || !allowedPorts.has(port)) {
    return { ok: false, reason: "ssrf", message: `Port not allowed: ${String(port)}` };
  }
  // A WHATWG URL keeps the brackets on an IPv6 host ("[::1]"), which `isIP` rejects. Strip them, or
  // every IPv6 literal goes to the resolver instead of being checked here: glibc refuses the
  // bracketed name (so a public literal is wrongly refused), while the Windows resolver accepts it.
  const hostname = unbracketIpv6(parsed.hostname);
  if (hostname === "") return { ok: false, reason: "ssrf", message: "Missing hostname." };

  if (trustedHostnames.has(hostname.toLowerCase())) {
    // Test hook: MSW handles the actual response; DNS never runs.
    return { ok: true, resolvedIps: [] };
  }

  const ips: string[] = [];
  if (isIP(hostname) !== 0) {
    ips.push(hostname);
  } else {
    try {
      const results = await lookup(hostname, { all: true, verbatim: true });
      for (const r of results) ips.push(r.address);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { ok: false, reason: "ssrf", message: `DNS lookup failed: ${message}` };
    }
    if (ips.length === 0) return { ok: false, reason: "ssrf", message: "No addresses for hostname." };
  }

  for (const ip of ips) {
    if (isPrivateAddress(ip)) {
      return { ok: false, reason: "ssrf", message: `Private/reserved address: ${ip}` };
    }
  }
  return { ok: true, resolvedIps: ips };
}

/** `[::1]` → `::1`; any other host is returned unchanged. */
function unbracketIpv6(hostname: string): string {
  return hostname.startsWith("[") && hostname.endsWith("]") ? hostname.slice(1, -1) : hostname;
}

/** Exposed for tests: true when the given IP literal is a non-public address. */
export function isPrivateAddress(ip: string): boolean {
  if (isIPv4(ip)) return isIpv4Private(ip);
  if (isIPv6(ip)) return isIpv6Private(ip);
  // Not a parseable IP — treat as blocked (should have been caught earlier).
  return true;
}

function isIpv4Private(ip: string): boolean {
  const bits = ipv4ToBits(ip);
  if (bits === null) return true;
  for (const [network, prefix] of IPV4_PRIVATE) {
    const nb = ipv4ToBits(network);
    if (nb === null) continue;
    // All prefixes in IPV4_PRIVATE are >=1, so the shift is always well-defined.
    const mask = ~0 << (32 - prefix);
    if ((bits & mask) === (nb & mask)) return true;
  }
  return false;
}

function ipv4ToBits(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    const n = Number(part);
    if (!Number.isInteger(n) || n < 0 || n > 255) return null;
    value = ((value << 8) | n) >>> 0;
  }
  return value | 0;
}

function isIpv6Private(ip: string): boolean {
  const lower = ip.toLowerCase();
  // ::ffff:1.2.3.4 → also check the v4 mapping.
  if (lower.startsWith("::ffff:")) {
    const inner = lower.slice("::ffff:".length);
    if (isIPv4(inner)) return isIpv4Private(inner);
  }
  return IPV6_PRIVATE_PREFIXES.some((prefix) => lower === prefix || lower.startsWith(prefix));
}
