/**
 * Numbers in and out of SAM 2. Framework-free, covered by unit tests.
 *
 * SAM reads a 1024 × 1024 copy of the picture (stretched) and answers each click with three
 * candidate masks, as 256 × 256 grids of scores (above 0: the object), and how confident it is
 * in each.
 */

/** Side of the square picture SAM reads. */
export const SAM_INPUT = 1024;

/** Longest side of the copy of the picture handed to SAM: it reads 1024 px anyway. */
export const SAM_WORK_SIDE = 1024;

export interface SamPoint {
  /** In pixels of the picture handed to SAM. */
  x: number;
  y: number;
  /** true: part of the object; false: not part of it. */
  positive: boolean;
}

/** Size of the copy of a `width` × `height` picture handed to SAM: same shape, at most SAM_WORK_SIDE. */
export function samWorkSize(width: number, height: number): { width: number; height: number } {
  const scale = Math.min(1, SAM_WORK_SIDE / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** A point of the picture in SAM's square: (x, y) of a `width` × `height` picture. */
export function toSamInput(point: SamPoint, width: number, height: number): [number, number] {
  return [(point.x * SAM_INPUT) / width, (point.y * SAM_INPUT) / height];
}

/** Index of the candidate SAM is the most confident in. */
export function bestMask(scores: ArrayLike<number>): number {
  let best = 0;
  for (let i = 1; i < scores.length; i++) if (scores[i] > scores[best]) best = i;
  return best;
}

/**
 * One candidate's grid of scores (`low` × `low`, starting at `offset`), enlarged to
 * `width` × `height` by bilinear interpolation of the scores, then turned into opacities.
 * Interpolating scores rather than opacities keeps the outline sharp.
 */
export function samAlpha(scores: ArrayLike<number>, offset: number, low: number, width: number, height: number): Uint8ClampedArray<ArrayBuffer> {
  const alpha = new Uint8ClampedArray(width * height);
  const sx = low / width;
  const sy = low / height;
  for (let y = 0; y < height; y++) {
    const fy = Math.min(low - 1, Math.max(0, (y + 0.5) * sy - 0.5));
    const y0 = Math.floor(fy);
    const y1 = Math.min(low - 1, y0 + 1);
    const ty = fy - y0;
    for (let x = 0; x < width; x++) {
      const fx = Math.min(low - 1, Math.max(0, (x + 0.5) * sx - 0.5));
      const x0 = Math.floor(fx);
      const x1 = Math.min(low - 1, x0 + 1);
      const tx = fx - x0;
      const top = scores[offset + y0 * low + x0] * (1 - tx) + scores[offset + y0 * low + x1] * tx;
      const bottom = scores[offset + y1 * low + x0] * (1 - tx) + scores[offset + y1 * low + x1] * tx;
      const score = top * (1 - ty) + bottom * ty;
      alpha[y * width + x] = 255 / (1 + Math.exp(-score));
    }
  }
  return alpha;
}

/** How far below the best score a larger candidate may be and still be preferred. */
export const PREFER_LARGER_MARGIN = 0.15;

/**
 * The candidate to keep. For a single click, SAM's three answers go from a part to the whole
 * object; the user usually means the whole object, so the largest candidate is kept when SAM is
 * nearly as confident in it as in its best one. Otherwise, its best one.
 */
export function chooseMask(scores: ArrayLike<number>, masks: ArrayLike<number>, low: number, preferLarger: boolean): number {
  const best = bestMask(scores);
  if (!preferLarger) return best;
  const area = low * low;
  let chosen = best;
  let chosenSize = -1;
  for (let i = 0; i < scores.length; i++) {
    if (scores[i] < scores[best] - PREFER_LARGER_MARGIN) continue;
    let size = 0;
    for (let p = i * area; p < (i + 1) * area; p++) if (masks[p] > 0) size++;
    if (size > chosenSize) {
      chosen = i;
      chosenSize = size;
    }
  }
  return chosen;
}

/** A box of the picture in SAM's square: [x1, y1, x2, y2]. */
export function boxToSamInput(box: { x: number; y: number; width: number; height: number }, width: number, height: number): [number, number, number, number] {
  return [(box.x * SAM_INPUT) / width, (box.y * SAM_INPUT) / height, ((box.x + box.width) * SAM_INPUT) / width, ((box.y + box.height) * SAM_INPUT) / height];
}
