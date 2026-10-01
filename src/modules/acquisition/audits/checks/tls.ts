/**
 * Minimal TLS certificate probe for the SSL check. SSRF-guarded (the same private-IP rules as
 * `safeFetch`) before connecting, hard timeout, and it never sends data — it reads the peer
 * certificate on the secure handshake and closes.
 */

import "server-only";

import { connect } from "node:tls";

import { guardUrl } from "@/platform/http";

export interface CertInfo {
  valid: boolean;
  validTo: Date | null;
  daysToExpiry: number | null;
}

const TIMEOUT_MS = 8_000;

export async function getCertInfo(hostname: string, now: Date): Promise<CertInfo | null> {
  // Reuse the SSRF guard: refuse private/reserved hosts before opening a socket.
  const guard = await guardUrl(`https://${hostname}/`);
  if (!guard.ok) return null;

  return new Promise<CertInfo | null>((resolve) => {
    let settled = false;
    const finish = (value: CertInfo | null): void => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(value);
    };
    const socket = connect(
      { host: hostname, port: 443, servername: hostname, timeout: TIMEOUT_MS },
      () => {
        const cert = socket.getPeerCertificate();
        if (!cert.valid_to) {
          finish({ valid: socket.authorized, validTo: null, daysToExpiry: null });
          return;
        }
        const validTo = new Date(cert.valid_to);
        const daysToExpiry = Math.round((validTo.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
        finish({ valid: socket.authorized && validTo.getTime() > now.getTime(), validTo, daysToExpiry });
      },
    );
    socket.on("timeout", () => {
      finish(null);
    });
    socket.on("error", () => {
      finish({ valid: false, validTo: null, daysToExpiry: null });
    });
  });
}
