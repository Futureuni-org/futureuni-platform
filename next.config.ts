import type { NextConfig } from "next";
import { withWorkflow } from "workflow/next";

// Validates every environment variable first, so a bad value fails `next dev` and `next build`
// immediately instead of on the first request.
import "./src/env";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  experimental: {
    serverActions: {
      // The 1MB default is small for any form that carries a file. 4MB leaves room under Vercel's
      // 4.5MB request limit for multipart overhead. (The avatar no longer goes through an action:
      // it posts to /api/avatars so the browser can report upload progress.)
      bodySizeLimit: "4mb",
    },
  },
};

// Vercel Workflow (ADR-003): compiles "use workflow" / "use step" functions and generates the
// runtime routes under src/app/.well-known/workflow/ (gitignored).
export default withWorkflow(nextConfig);
