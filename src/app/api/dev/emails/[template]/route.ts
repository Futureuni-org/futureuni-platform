/**
 * `GET /api/dev/emails/[template]` — Phase 6. Renders any email template with its `defaultProps`
 * so a designer or developer can preview it.
 *
 * Development only; returns 404 in production.
 */

import "server-only";

import { env } from "@/env";
import { errorResponse } from "@/lib/errors";
import { EMAIL_TEMPLATES, type EmailTemplateId } from "@/emails/index";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ template: string }>;
}

export async function GET(_request: Request, ctx: RouteContext): Promise<Response> {
  try {
    if (env.NODE_ENV === "production") {
      return new Response("Not found", { status: 404 });
    }
    const { template: id } = await ctx.params;
    if (!Object.prototype.hasOwnProperty.call(EMAIL_TEMPLATES, id)) {
      return new Response("Unknown template", { status: 404 });
    }
    const template = EMAIL_TEMPLATES[id as EmailTemplateId];
    const rendered = await template.render(template.defaultProps as never);
    return new Response(rendered.html, { headers: { "content-type": "text/html; charset=utf-8" } });
  } catch (error) {
    return errorResponse(error);
  }
}
