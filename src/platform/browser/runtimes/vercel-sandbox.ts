/**
 * `vercel-sandbox` runtime (ADR-017 primary): runs the capture inside an ephemeral Firecracker
 * microVM created from a snapshot that pre-installs Node, Playwright, its Chromium and axe. The
 * untrusted page is loaded with none of this app's secrets present. One capture per sandbox, stopped
 * in a `finally`.
 *
 * Requires deployment configuration (`VERCEL_SANDBOX_SNAPSHOT_ID` and Vercel OIDC/token auth), so it
 * is not exercised by the local test suite; infrastructure failures degrade to a failed capture
 * rather than throwing, so one bad capture never crashes an audit.
 */

import "server-only";

import { Sandbox } from "@vercel/sandbox";

import { env } from "@/env";

import { fromRemoteResult, RemoteCaptureResultSchema, remoteRequestBody } from "../remote";
import { CAPTURE_RUNNER_SOURCE } from "../worker-source";
import type { BrowserRuntime, NormalizedCaptureRequest, RawCaptureResult } from "../types";

const RUNNER_PATH = "/vercel/sandbox/runner.mjs";
const REQUEST_PATH = "/vercel/sandbox/request.json";

export const vercelSandboxRuntime: BrowserRuntime = {
  id: "vercel-sandbox",
  async capture(req: NormalizedCaptureRequest): Promise<RawCaptureResult> {
    const failed: RawCaptureResult = {
      ok: false,
      finalUrl: req.url,
      timings: { loadMs: 0 },
      blockedReason: "error",
    };
    let sandbox: Sandbox | undefined;
    try {
      const common = {
        persistent: false as const,
        timeout: req.timeoutMs + 30_000,
        resources: { vcpus: 2 },
      };
      sandbox =
        env.VERCEL_SANDBOX_SNAPSHOT_ID === undefined
          ? await Sandbox.create(common)
          : await Sandbox.create({
              ...common,
              source: { type: "snapshot", snapshotId: env.VERCEL_SANDBOX_SNAPSHOT_ID },
            });
      await sandbox.writeFiles([
        { path: "request.json", content: Buffer.from(remoteRequestBody(req)) },
        { path: "runner.mjs", content: Buffer.from(CAPTURE_RUNNER_SOURCE) },
      ]);
      const result = await sandbox.runCommand("node", [RUNNER_PATH, REQUEST_PATH]);
      if (result.exitCode !== 0) return failed;
      const stdout = await result.stdout();
      return fromRemoteResult(RemoteCaptureResultSchema.parse(JSON.parse(stdout) as unknown));
    } catch {
      return failed;
    } finally {
      if (sandbox !== undefined) await sandbox.stop().catch(() => undefined);
    }
  },
};
