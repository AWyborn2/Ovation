/**
 * Geometry for the shared image crop dialog (Social Studio U23). The image is
 * drawn inside a fixed frame at `coverScale × zoom`, offset by (x, y) frame
 * pixels from the frame's top-left. Offsets are always clamped so the image
 * covers the frame: zooming or panning never exposes empty space.
 */

export type Size = { width: number; height: number };
export type Offset = { x: number; y: number };

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 4;

/** The scale at which the image just covers the frame (zoom 1). */
export function coverScale(image: Size, frame: Size): number {
  return Math.max(frame.width / image.width, frame.height / image.height);
}

export function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

/** Clamp an offset so the scaled image still covers the whole frame. */
export function clampOffset(offset: Offset, image: Size, frame: Size, zoom: number): Offset {
  const scale = coverScale(image, frame) * clampZoom(zoom);
  const minX = frame.width - image.width * scale;
  const minY = frame.height - image.height * scale;
  return {
    x: Math.min(0, Math.max(minX, offset.x)),
    y: Math.min(0, Math.max(minY, offset.y)),
  };
}

/** The offset that centres the image in the frame at a zoom. */
export function centredOffset(image: Size, frame: Size, zoom: number): Offset {
  const scale = coverScale(image, frame) * clampZoom(zoom);
  return {
    x: (frame.width - image.width * scale) / 2,
    y: (frame.height - image.height * scale) / 2,
  };
}

/**
 * Change zoom keeping the frame's centre point fixed on the same spot of the
 * image, then clamp so the image still covers the frame.
 */
export function zoomAroundCentre(
  offset: Offset,
  image: Size,
  frame: Size,
  fromZoom: number,
  toZoom: number,
): Offset {
  const base = coverScale(image, frame);
  const from = base * clampZoom(fromZoom);
  const to = base * clampZoom(toZoom);
  const cx = frame.width / 2;
  const cy = frame.height / 2;
  const next = {
    x: cx - ((cx - offset.x) / from) * to,
    y: cy - ((cy - offset.y) / from) * to,
  };
  return clampOffset(next, image, frame, toZoom);
}

/** The region of the source image (in source pixels) the frame shows. */
export function cropRect(
  offset: Offset,
  image: Size,
  frame: Size,
  zoom: number,
): { x: number; y: number; width: number; height: number } {
  const scale = coverScale(image, frame) * clampZoom(zoom);
  return {
    x: -offset.x / scale,
    y: -offset.y / scale,
    width: frame.width / scale,
    height: frame.height / scale,
  };
}

/** The output size: the suggested size, or the cropped source when that is smaller. */
export function outputSize(crop: Size, suggested: Size): Size {
  const scale = Math.min(1, suggested.width / crop.width);
  return {
    width: Math.max(1, Math.round(crop.width * scale)),
    height: Math.max(1, Math.round(crop.height * scale)),
  };
}

/** True when the cropped region has fewer pixels across than the suggested size. */
export function isLowResolution(crop: Size, suggested: Size): boolean {
  return Math.round(crop.width) < suggested.width || Math.round(crop.height) < suggested.height;
}
