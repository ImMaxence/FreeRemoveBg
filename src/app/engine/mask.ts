/**
 * Numbers in and out of the segmentation model. Framework-free: used by the AI worker and
 * covered by unit tests.
 */

/** RGBA pixels of a square picture → the model's input: 3 planes (R, G, B), each normalised. */
export function pixelsToInput(pixels: Uint8ClampedArray, size: number, mean: readonly number[], std: readonly number[]): Float32Array {
  const area = size * size;
  const input = new Float32Array(3 * area);
  for (let c = 0; c < 3; c++) {
    const offset = c * area;
    const m = mean[c];
    const s = std[c];
    for (let i = 0; i < area; i++) input[offset + i] = (pixels[i * 4 + c] / 255 - m) / s;
  }
  return input;
}

/** A half-precision float (models run in fp16 on the graphics card) as a number. */
export function halfToFloat(h: number): number {
  const exponent = (h & 0x7c00) >> 10;
  const fraction = h & 0x03ff;
  const sign = h & 0x8000 ? -1 : 1;
  if (exponent === 0) return sign * 2 ** -14 * (fraction / 1024);
  if (exponent === 0x1f) return fraction ? NaN : sign * Infinity;
  return sign * 2 ** (exponent - 15) * (1 + fraction / 1024);
}

/**
 * The model's answer → opacity of each pixel (0 background, 255 subject). Some models give raw
 * scores (any number: turned into 0–1 by a sigmoid), others a ready mask (already 0–1): the
 * range of the values tells which.
 */
export function alphaFromScores(scores: ArrayLike<number>, length: number): Uint8ClampedArray<ArrayBuffer> {
  const half = scores instanceof Uint16Array;
  const value = (i: number) => (half ? halfToFloat(scores[i]) : scores[i]);
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < length; i++) {
    const v = value(i);
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const raw = min < -0.01 || max > 1.01;
  const alpha = new Uint8ClampedArray(length);
  for (let i = 0; i < length; i++) alpha[i] = raw ? 255 / (1 + Math.exp(-value(i))) : value(i) * 255;
  return alpha;
}

/** Longest side of the mask kept for a picture: the models read 1024 px, edits stay smooth above. */
export const MASK_MAX_SIDE = 2048;

/** Size of the mask of a `width` × `height` picture: same shape, at most MASK_MAX_SIDE. */
export function maskSize(width: number, height: number): { width: number; height: number } {
  const scale = Math.min(1, MASK_MAX_SIDE / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** Size a picture is worked on: the whole picture, shrunk only above `maxPixels`. */
export function workingSize(width: number, height: number, maxPixels: number): { width: number; height: number } {
  const scale = Math.min(1, Math.sqrt(maxPixels / (width * height)));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}
