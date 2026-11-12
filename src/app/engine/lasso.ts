/**
 * The lasso: a shape drawn on the picture point by point (clicks) or freehand (a drag), then
 * restored or cut out of the cutout, inside the shape or around it. Framework-free, covered by
 * unit tests. Points are in pixels of the picture.
 */

export interface LassoPoint {
  x: number;
  y: number;
}

/** Fewer points make no shape. */
export const LASSO_MIN_POINTS = 3;
/** How close to the first point (on screen, CSS pixels) a click closes the shape. */
export const LASSO_CLOSE_DISTANCE = 12;
/** Freehand: how far apart (on screen, CSS pixels) the points of a drag are kept. */
export const LASSO_FREEHAND_GAP = 4;
/** A click this close to the last point (on screen) adds nothing: a double click is one point. */
export const LASSO_SAME_POINT = 3;

const distance = (a: LassoPoint, b: LassoPoint) => Math.hypot(a.x - b.x, a.y - b.y);

/** Does a click at `at` close the shape? `scale` turns pixels of the picture into pixels of the screen. */
export function closesShape(points: readonly LassoPoint[], at: LassoPoint, scale: number): boolean {
  return (
    points.length >= LASSO_MIN_POINTS && distance(points[0], at) * scale <= LASSO_CLOSE_DISTANCE
  );
}

/** Is `at` far enough from the last point (on screen) to be a new one? */
export function isNewPoint(
  points: readonly LassoPoint[],
  at: LassoPoint,
  scale: number,
  gap = LASSO_SAME_POINT,
): boolean {
  const last = points.at(-1);
  return !last || distance(last, at) * scale >= gap;
}

/** Area enclosed by the shape (in square pixels), whatever the direction it was drawn in. */
export function shapeArea(points: readonly LassoPoint[]): number {
  let twice = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    twice += a.x * b.y - b.x * a.y;
  }
  return Math.abs(twice) / 2;
}

/** Enough points, enclosing something: a line or three clicks on one spot are not a shape. */
export function isShape(points: readonly LassoPoint[]): boolean {
  return points.length >= LASSO_MIN_POINTS && shapeArea(points) >= 1;
}

/** A point kept within the picture. */
export function clampPoint(point: LassoPoint, width: number, height: number): LassoPoint {
  return { x: Math.min(width, Math.max(0, point.x)), y: Math.min(height, Math.max(0, point.y)) };
}

/** Distance from `p` to the segment from `a` to `b`. */
function toSegment(p: LassoPoint, a: LassoPoint, b: LassoPoint): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = dx * dx + dy * dy;
  if (!length) return distance(p, a);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/**
 * A freehand line with far fewer points and the same look (Ramer–Douglas–Peucker): points less
 * than `tolerance` pixels away from the simplified line are dropped. The ends are always kept.
 */
export function simplify(points: readonly LassoPoint[], tolerance: number): LassoPoint[] {
  if (points.length < 3) return [...points];
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop()!;
    let farthest = -1;
    let far = tolerance;
    for (let i = first + 1; i < last; i++) {
      const d = toSegment(points[i], points[first], points[last]);
      if (d > far) {
        far = d;
        farthest = i;
      }
    }
    if (farthest < 0) continue;
    keep[farthest] = 1;
    stack.push([first, farthest], [farthest, last]);
  }
  return points.filter((_, i) => keep[i]);
}

/**
 * SVG path of the shape. `around`: the whole picture (`width` × `height`) minus the shape, to
 * fill with the even-odd rule, as when the change applies around the shape.
 */
export function shapePath(
  points: readonly LassoPoint[],
  closed: boolean,
  around?: { width: number; height: number },
): string {
  if (!points.length) return '';
  const round = (n: number) => Math.round(n * 10) / 10;
  const line =
    points.map((p, i) => `${i ? 'L' : 'M'}${round(p.x)} ${round(p.y)}`).join('') +
    (closed ? 'Z' : '');
  return around ? `M0 0H${around.width}V${around.height}H0Z${line}` : line;
}
