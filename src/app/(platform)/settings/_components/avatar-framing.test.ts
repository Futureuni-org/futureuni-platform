import { describe, expect, it } from "vitest";

import { baseScale, clampOffset, PREVIEW_PX } from "./avatar-framing";

/**
 * The cropper's geometry. What matters is that the circle can never show an empty corner: the
 * image may be dragged exactly as far as it overhangs, and no further. A portrait logo — the case
 * that started this, where the circle cropped the top and bottom away — must be free to move
 * vertically and pinned horizontally.
 */

const portrait = { naturalWidth: 411, naturalHeight: 533 };
const landscape = { naturalWidth: 1600, naturalHeight: 900 };
const square = { naturalWidth: 800, naturalHeight: 800 };

describe("avatar framing", () => {
  it("fills the circle with the shorter side at zoom 1", () => {
    expect(portrait.naturalWidth * baseScale(portrait)).toBe(PREVIEW_PX);
    expect(landscape.naturalHeight * baseScale(landscape)).toBe(PREVIEW_PX);
  });

  it("lets a portrait image move vertically but pins it horizontally", () => {
    const moved = clampOffset({ x: 999, y: 999 }, portrait, 1);

    expect(moved.x).toBe(0);
    // Its height overhangs the circle, so half of that overhang is the limit.
    expect(moved.y).toBeCloseTo((portrait.naturalHeight * baseScale(portrait) - PREVIEW_PX) / 2, 5);
  });

  it("pins a square image at zoom 1 and frees it once zoomed", () => {
    expect(clampOffset({ x: 50, y: -50 }, square, 1)).toEqual({ x: 0, y: 0 });

    const zoomed = clampOffset({ x: 999, y: 999 }, square, 2);
    expect(zoomed.x).toBeCloseTo(PREVIEW_PX / 2, 5);
    expect(zoomed.y).toBeCloseTo(PREVIEW_PX / 2, 5);
  });

  it("clamps both directions symmetrically", () => {
    const positive = clampOffset({ x: 999, y: 999 }, landscape, 1);
    const negative = clampOffset({ x: -999, y: -999 }, landscape, 1);

    expect(negative.x).toBeCloseTo(-positive.x, 5);
    expect(negative.y).toBe(0);
    expect(positive.y).toBe(0);
  });

  it("leaves a position that is already inside the limits alone", () => {
    expect(clampOffset({ x: 10, y: -12 }, landscape, 2)).toEqual({ x: 10, y: -12 });
  });
});
