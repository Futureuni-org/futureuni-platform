import type { NextConfig } from "next";
import { withWorkflow } from "workflow/next";

// Validates every environment variable first, so a bad value fails `next dev` and `next build`
// immediately instead of on the first request.
import "./src/env";

const nextConfig: NextConfig = {
  poweredByHeader: false,
};

// Vercel Workflow (ADR-003): compiles "use workflow" / "use step" functions and generates the
// runtime routes under src/app/.well-known/workflow/ (gitignored).
export default withWorkflow(nextConfig);
