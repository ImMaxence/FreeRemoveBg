/**
 * Geometry of what is done to a picture before the AI reads it: turning it, cropping it, and
 * choosing the area to cut out. Framework-free, covered by unit tests.
 */

/** An area of a picture, in pixels from its top left corner. */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Smallest side of an area worth cropping to or handing to the AI. */
export const MIN_AREA_SIDE = 16;

/**
 * The area between two points given as fractions of the picture (0–1), as the pointer gives
 * them: in any order, and possibly outside the picture. Null when it is too small to be meant.
 */
export function areaBetween(ax: number, ay: number, bx: number, by: number, width: number, height: number): Rect | null {
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  const left = Math.round(clamp(Math.min(ax, bx)) * width);
  const top = Math.round(clamp(Math.min(ay, by)) * height);
  const right = Math.round(clamp(Math.max(ax, bx)) * width);
  const bottom = Math.round(clamp(Math.max(ay, by)) * height);
  if (right - left < MIN_AREA_SIDE || bottom - top < MIN_AREA_SIDE) return null;
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/** An area of a `width` × `height` picture, in the pixels of a `toWidth` × `toHeight` copy of it. */
export function scaleRect(rect: Rect, width: number, height: number, toWidth: number, toHeight: number): Rect {
  const sx = toWidth / width;
  const sy = toHeight / height;
  return { x: rect.x * sx, y: rect.y * sy, width: rect.width * sx, height: rect.height * sy };
}

/** Size of a picture turned by quarter turns: an odd number of them swaps its sides. */
export function turnedSize(width: number, height: number, quarters: number): { width: number; height: number } {
  return quarters % 2 ? { width: height, height: width } : { width, height };
}

/**
 * Draws a picture turned by `quarters` quarter turns clockwise (negative: counterclockwise)
 * onto a canvas context sized by `turnedSize`.
 */
export function drawTurned(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, source: CanvasImageSource, width: number, height: number, quarters: number): void {
  const turns = ((quarters % 4) + 4) % 4;
  const size = turnedSize(width, height, turns);
  ctx.save();
  ctx.translate(size.width / 2, size.height / 2);
  ctx.rotate((turns * Math.PI) / 2);
  ctx.drawImage(source, -width / 2, -height / 2, width, height);
  ctx.restore();
}
