/**
 * Streaming endpoint for the review queue's AI assist. Pipes `streamDraftEdit`'s task events to the
 * client as Server-Sent Events so edits stream into the editor live. Node runtime (streaming needs
 * no Edge). The service authorises on the actor and validates the final output.
 */

import { AppError } from "@/lib/errors";
import { requireUser, actorOf } from "@/platform/auth";
import { streamDraftEdit } from "@/modules/acquisition/outreach";

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: { code: "VALIDATION_FAILED", message: "Invalid body." } }, { status: 400 });
  }
  const { messageId, instruction } = (body ?? {}) as { messageId?: unknown; instruction?: unknown };
  if (typeof messageId !== "string" || typeof instruction !== "string" || instruction.trim().length === 0) {
    return Response.json(
      { error: { code: "VALIDATION_FAILED", message: "messageId and a non-empty instruction are required." } },
      { status: 400 },
    );
  }

  const user = await requireUser();

  let source: ReadableStream<unknown>;
  try {
    source = await streamDraftEdit(actorOf(user), messageId, instruction.slice(0, 400));
  } catch (error) {
    const appError = error instanceof AppError ? error : null;
    return Response.json(
      { error: { code: appError?.code ?? "INTERNAL", message: appError?.message ?? "Couldn't start the edit." } },
      { status: appError?.status ?? 500 },
    );
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = source.getReader();
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(value)}\n\n`));
        }
      } catch {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: "error", code: "AI_PROVIDER_ERROR", message: "The edit stream failed." })}\n\n`,
          ),
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
    },
  });
}
