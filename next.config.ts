import type { NextConfig } from "next";
import { withWorkflow } from "workflow/next";

// Validates every environment variable first, so a bad value fails `next dev` and `next build`
// immediately instead of on the first request.
import "./src/env";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  experimental: {
    serverActions: {
      // Server Actions cap the request body at 1MB by default, which an avatar photo exceeds (the
      // upload then fails before the handler runs). 4MB leaves room under Vercel's 4.5MB request
      // limit for the multipart overhead. The browser shrinks avatars well below this first.
      bodySizeLimit: "4mb",
    },
  },
};

// Vercel Workflow (ADR-003): compiles "use workflow" / "use step" functions and generates the
// runtime routes under src/app/.well-known/workflow/ (gitignored).
export default withWorkflow(nextConfig);
