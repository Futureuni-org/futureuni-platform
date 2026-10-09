"use client";

import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import {
  clampOffset,
  drawFramed,
  MAX_ZOOM,
  MIN_ZOOM,
  OUTPUT_PX,
  PREVIEW_PX,
  PREVIEW_RENDER_PX,
  type Offset,
} from "./avatar-framing";

/**
 * Frames an avatar before it is uploaded. The circle crops whatever it is given, so a portrait
 * logo or photo used to arrive scaled up with its top and bottom cut off. Here the person sets the
 * zoom and position, and a square image is saved, so nothing is cropped again downstream.
 *
 * The preview is drawn with the same function as the exported file, so the circle shows exactly
 * what will be stored rather than a CSS approximation of it.
 */

/** One arrow-key press, in preview pixels. */
const NUDGE_PX = 8;

export function AvatarCropper({
  source,
  onCancel,
  onConfirm,
  onUnavailable,
}: {
  /** A newly chosen file, the URL of the stored original to re-frame, or null when closed. */
  source: File | string | null;
  onCancel: () => void;
  onConfirm: (framed: File) => void;
  /** The stored original could not be loaded, so there is nothing to adjust. */
  onUnavailable: () => void;
}) {
  const [loaded, setLoaded] = useState<{ from: File | string; image: HTMLImageElement } | null>(
    null,
  );
  const [zoom, setZoom] = useState(MIN_ZOOM);
  const [offset, setOffset] = useState<Offset>({ x: 0, y: 0 });
  const [working, setWorking] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ pointerId: number; startX: number; startY: number; from: Offset } | null>(
    null,
  );

  // Only the decoded image for the file currently being framed counts: a previous one must never
  // flash in the circle while the new file decodes.
  const image = loaded !== null && loaded.from === source ? loaded.image : null;

  // Held in a ref so a new closure from the parent on every render does not re-run the load
  // effect, which would re-fetch the image and reset the framing the person is in the middle of.
  const onUnavailableRef = useRef(onUnavailable);
  useEffect(() => {
    onUnavailableRef.current = onUnavailable;
  }, [onUnavailable]);

  useEffect(() => {
    if (source === null) return;
    // A freshly chosen file needs an object URL; a stored original is already a same-origin URL,
    // which also keeps the canvas untainted so it can be exported.
    const objectUrl = typeof source === "string" ? null : URL.createObjectURL(source);
    const src = objectUrl ?? (typeof source === "string" ? source : "");
    const element = new Image();
    element.addEventListener("load", () => {
      setLoaded({ from: source, image: element });
      setZoom(MIN_ZOOM);
      setOffset({ x: 0, y: 0 });
    });
    element.addEventListener("error", () => {
      onUnavailableRef.current();
    });
    element.src = src;
    return () => {
      if (objectUrl !== null) URL.revokeObjectURL(objectUrl);
    };
  }, [source]);

  useEffect(() => {
    const context = canvasRef.current?.getContext("2d");
    if (context === undefined || context === null || image === null) return;
    drawFramed(context, image, zoom, offset, PREVIEW_RENDER_PX);
  }, [image, zoom, offset]);

  function move(next: Offset): void {
    setOffset(image === null ? next : clampOffset(next, image, zoom));
  }

  function changeZoom(next: number): void {
    setZoom(next);
    if (image !== null) setOffset((current) => clampOffset(current, image, next));
  }

  async function confirm(): Promise<void> {
    if (image === null) return;
    setWorking(true);
    const canvas = document.createElement("canvas");
    canvas.width = OUTPUT_PX;
    canvas.height = OUTPUT_PX;
    const context = canvas.getContext("2d");
    if (context !== null) {
      drawFramed(context, image, zoom, offset, OUTPUT_PX);
      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob(
          (result) => {
            resolve(result);
          },
          "image/webp",
          0.9,
        );
      });
      if (blob !== null && blob.size > 0) {
        onConfirm(new File([blob], "avatar.webp", { type: "image/webp" }));
      }
    }
    setWorking(false);
  }

  return (
    <Dialog
      open={source !== null}
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Position your avatar</DialogTitle>
          <DialogDescription>
            Drag the image to move it and use the slider to zoom. The circle shows exactly what is
            saved.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-5 py-2">
          <div
            role="group"
            aria-label="Avatar position. Drag it, or use the arrow keys."
            tabIndex={0}
            className="relative cursor-grab touch-none overflow-hidden rounded-full bg-zone ring-offset-2 ring-offset-background outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
            style={{ width: PREVIEW_PX, height: PREVIEW_PX }}
            onPointerDown={(event) => {
              if (image === null) return;
              event.currentTarget.setPointerCapture(event.pointerId);
              drag.current = {
                pointerId: event.pointerId,
                startX: event.clientX,
                startY: event.clientY,
                from: offset,
              };
            }}
            onPointerMove={(event) => {
              const active = drag.current;
              if (active?.pointerId !== event.pointerId) return;
              move({
                x: active.from.x + (event.clientX - active.startX),
                y: active.from.y + (event.clientY - active.startY),
              });
            }}
            onPointerUp={() => {
              drag.current = null;
            }}
            onPointerCancel={() => {
              drag.current = null;
            }}
            onKeyDown={(event) => {
              const steps: Record<string, Offset> = {
                ArrowLeft: { x: -NUDGE_PX, y: 0 },
                ArrowRight: { x: NUDGE_PX, y: 0 },
                ArrowUp: { x: 0, y: -NUDGE_PX },
                ArrowDown: { x: 0, y: NUDGE_PX },
              };
              const step = steps[event.key];
              if (step === undefined) return;
              event.preventDefault();
              move({ x: offset.x + step.x, y: offset.y + step.y });
            }}
          >
            <canvas
              ref={canvasRef}
              width={PREVIEW_RENDER_PX}
              height={PREVIEW_RENDER_PX}
              className="size-full"
            />
          </div>

          <label className="flex w-full max-w-64 flex-col gap-2">
            <span className="text-sm font-medium text-foreground">Zoom</span>
            <input
              type="range"
              min={MIN_ZOOM}
              max={MAX_ZOOM}
              step={0.01}
              value={zoom}
              disabled={image === null}
              onChange={(event) => {
                changeZoom(Number(event.target.value));
              }}
              className="h-12 w-full accent-primary"
            />
          </label>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onCancel} disabled={working}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              void confirm();
            }}
            loading={working}
            disabled={image === null}
          >
            Use this
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
