# src/platform/browser/

**Owner: Phase 10 (Audits).** The headless-browser capture runtime (ADR-017). `capture(req)` is the
single entry point (public types in `@/contracts/audit-agent`).

## Runtimes (chosen by `BROWSER_RUNTIME`)

- **`vercel-sandbox`** (primary, production): runs the capture inside an ephemeral Firecracker microVM
  from a snapshot that pre-installs Node, Playwright, Chromium and axe, so untrusted pages load with
  none of the app's secrets. Requires `VERCEL_SANDBOX_SNAPSHOT_ID` and Vercel OIDC/token auth
  (verified by inspection; not exercised by the local test suite).
- **`serverless-chromium`** (fallback): HMAC-signed POST (`x-futureuni-signature`) to a separate,
  secret-free project (`BROWSER_FALLBACK_URL`) running `@sparticuz/chromium` + `playwright-core`.
- **`local-playwright`** (development): the locally installed Chromium (Edge channel if no
  `CHROMIUM_EXECUTABLE_PATH`).
- **`mock`** (tests / `MOCKS=true`): a fixture WebP screenshot and deterministic collected data.

The shared capture logic is `capture-worker.ts` (in-process, local) and `worker-source.ts` (the
standalone runner uploaded to the sandbox / deployed to the fallback project).

## Safety (enforced in code — `safety.ts`)

SSRF guard + `robots.txt` run before any capture; actions are navigation-only (`click-text`,
`scroll`) — never typing, submitting, logging in, or accepting cookie banners; one browser context
per capture, closed after; hard 20-second timeout. Screenshots are stored privately as WebP with a
retention window (`platform.retention.screenshotsDays`, default 90) via `@/platform/storage`.
