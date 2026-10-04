"use client";

import { useState, type KeyboardEvent } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { IconButton } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

import type { EvidenceArtifact } from "./detail-types";

/**
 * Screenshot gallery for one finding, with a lightbox. When a finding has both a mobile and a
 * desktop capture the first slide shows them side by side; the rest are the single captures. The
 * lightbox is fully keyboard-operable: Left/Right step through, Home/End jump, Escape closes.
 * Images are private signed URLs, so they bypass the image optimiser (`unoptimized`).
 */

type Slide =
  | { kind: "compare"; label: string; mobile: EvidenceArtifact; desktop: EvidenceArtifact }
  | { kind: "single"; label: string; artifact: EvidenceArtifact };

export function buildSlides(artifacts: EvidenceArtifact[]): Slide[] {
  const singles: Slide[] = artifacts.map((artifact) => ({
    kind: "single",
    label: artifact.label,
    artifact,
  }));
  const mobile = artifacts.find((a) => a.viewport === "mobile");
  const desktop = artifacts.find((a) => a.viewport === "desktop");
  if (mobile !== undefined && desktop !== undefined) {
    return [{ kind: "compare", label: "Mobile and desktop compared", mobile, desktop }, ...singles];
  }
  return singles;
}

function Shot({ artifact, heading }: { artifact: EvidenceArtifact; heading?: string }) {
  return (
    <figure className="flex min-w-0 flex-1 flex-col gap-2">
      {heading !== undefined && (
        <figcaption className="text-xs font-semibold tracking-[0.08em] text-muted uppercase">
          {heading}
        </figcaption>
      )}
      <div className="relative h-[55vh] w-full overflow-hidden rounded-md bg-zone">
        <Image
          src={artifact.url}
          alt={artifact.label}
          fill
          unoptimized
          sizes="(min-width: 1024px) 45vw, 90vw"
          className="object-contain"
        />
      </div>
    </figure>
  );
}

export function EvidenceGallery({
  artifacts,
  claim,
}: {
  artifacts: EvidenceArtifact[];
  claim: string;
}) {
  const [index, setIndex] = useState<number | null>(null);
  const slides = buildSlides(artifacts);
  if (slides.length === 0) return null;

  const last = slides.length - 1;
  const current = index === null ? null : (slides[index] ?? null);

  function step(delta: number) {
    setIndex((prev) => (prev === null ? prev : Math.min(Math.max(prev + delta, 0), last)));
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "ArrowRight") {
      event.preventDefault();
      step(1);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      step(-1);
    } else if (event.key === "Home") {
      event.preventDefault();
      setIndex(0);
    } else if (event.key === "End") {
      event.preventDefault();
      setIndex(last);
    }
  }

  return (
    <>
      <ul className="flex flex-wrap gap-3">
        {slides.map((slide, slideIndex) => {
          const thumb = slide.kind === "compare" ? slide.desktop : slide.artifact;
          return (
            <li key={`${slide.kind}-${slide.label}-${String(slideIndex)}`}>
              <button
                type="button"
                onClick={() => {
                  setIndex(slideIndex);
                }}
                aria-label={`Open screenshot: ${slide.label}`}
                className="group flex flex-col gap-1 rounded-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none"
              >
                <span className="relative block h-20 w-28 overflow-hidden rounded-md bg-zone">
                  <Image
                    src={thumb.url}
                    alt=""
                    fill
                    unoptimized
                    sizes="112px"
                    className="object-cover transition-opacity group-hover:opacity-80"
                  />
                </span>
                <span className="max-w-28 truncate text-xs text-muted">{slide.label}</span>
              </button>
            </li>
          );
        })}
      </ul>

      <Dialog
        open={current !== null}
        onOpenChange={(open) => {
          if (!open) setIndex(null);
        }}
      >
        <DialogContent className="max-w-5xl" onKeyDown={onKeyDown}>
          {current !== null && index !== null && (
            <>
              <DialogTitle className="pr-8 text-base">{claim}</DialogTitle>
              <DialogDescription aria-live="polite">
                {current.label} · {String(index + 1)} of {String(slides.length)}
              </DialogDescription>

              {current.kind === "compare" ? (
                <div className="flex flex-col gap-4 md:flex-row">
                  <Shot artifact={current.mobile} heading="Mobile" />
                  <Shot artifact={current.desktop} heading="Desktop" />
                </div>
              ) : (
                <Shot artifact={current.artifact} />
              )}

              {slides.length > 1 && (
                // `aria-disabled`, not `disabled`: a focused button that becomes disabled stops
                // emitting key events, which would strand keyboard users at either end.
                <div className="flex items-center justify-between">
                  <IconButton
                    aria-label="Previous screenshot"
                    aria-disabled={index === 0}
                    className="aria-disabled:cursor-not-allowed aria-disabled:opacity-60"
                    onClick={() => {
                      step(-1);
                    }}
                  >
                    <ChevronLeft aria-hidden className="size-5" />
                  </IconButton>
                  <IconButton
                    aria-label="Next screenshot"
                    aria-disabled={index === last}
                    className="aria-disabled:cursor-not-allowed aria-disabled:opacity-60"
                    onClick={() => {
                      step(1);
                    }}
                  >
                    <ChevronRight aria-hidden className="size-5" />
                  </IconButton>
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
