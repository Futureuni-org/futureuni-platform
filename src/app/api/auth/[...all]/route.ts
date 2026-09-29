/**
 * Better Auth catch-all handler (ADR-013). Every `/api/auth/**` request is routed to the
 * Better Auth instance and answered here.
 */

import { toNextJsHandler } from "better-auth/next-js";

import { auth } from "@/platform/auth";

export const { POST, GET } = toNextJsHandler(auth);
