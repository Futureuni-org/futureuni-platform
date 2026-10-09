/**
 * The geometry behind the avatar cropper, kept apart from the component so it can be tested
 * without a browser. The preview and the exported file share these functions, which is what makes
 * the circle show exactly what gets saved.
 */

/** The stored avatar's edge. 512 stays sharp on a retina screen at every size we render. */
export const OUTPUT_PX = 512;
/** The circle in the dialog, in CSS pixels. Comfortably draggable on a 375px screen. */
export const PREVIEW_PX = 256;
/** Drawn at twice that, so the preview is crisp on a retina screen. */
export const PREVIEW_RENDER_PX = PREVIEW_PX * 2;
export const MIN_ZOOM = 1;
export const MAX_ZOOM = 4;

export interface Offset {
  x: number;
  y: number;
}

/** Just the dimensions the geometry needs; an `HTMLImageElement` satisfies it. */
export interface Framed {
  naturalWidth: number;
  naturalHeight: number;
}

/** The scale at which the image's shorter side exactly fills the circle. */
export function baseScale(image: Framed): number {
  return PREVIEW_PX / Math.min(image.naturalWidth, image.naturalHeight);
}

/**
 * Holds the image inside the circle: it may be dragged only as far as its own overhang, so no
 * empty corner can ever appear. At zoom 1 the shorter side fits exactly, so that axis is pinned.
 */
export function clampOffset(offset: Offset, image: Framed, zoom: number): Offset {
  const scale = baseScale(image) * zoom;
  return {
    x: hold(offset.x, (image.naturalWidth * scale - PREVIEW_PX) / 2),
    y: hold(offset.y, (image.naturalHeight * scale - PREVIEW_PX) / 2),
  };
}

/** Clamps to ±slack, normalising the pinned case to +0 so the result compares as plain zero. */
function hold(value: number, overhang: number): number {
  const slack = Math.max(0, overhang);
  const held = Math.min(slack, Math.max(-slack, value));
  return held === 0 ? 0 : held;
}

/** Draws the framed image into a square of `size` pixels: the preview, or the file to upload. */
export function drawFramed(
  context: CanvasRenderingContext2D,
  image: CanvasImageSource & Framed,
  zoom: number,
  offset: Offset,
  size: number,
): void {
  const toSize = size / PREVIEW_PX;
  const scale = baseScale(image) * zoom * toSize;
  context.clearRect(0, 0, size, size);
  context.save();
  context.translate(size / 2 + offset.x * toSize, size / 2 + offset.y * toSize);
  context.scale(scale, scale);
  context.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2);
  context.restore();
}
