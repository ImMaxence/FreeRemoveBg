/**
 * The crop frame of the "Prepare" step: moved or resized by its handles, kept inside the
 * picture, optionally held to a ratio. Framework-free, covered by unit tests.
 */
import type { Rect } from './prepare';

/** What the pointer holds: the whole frame, a side or a corner (compass points). */
export type Handle = 'move' | 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

export const HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

/** Smallest side of the frame, in pixels of the picture. */
export const MIN_CROP = 32;

interface Size {
  width: number;
  height: number;
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** The largest frame of a ratio (width / height) that fits the picture, centred. Null: the whole picture. */
export function fitRatio(bounds: Size, ratio: number | null): Rect {
  if (!ratio) return { x: 0, y: 0, width: bounds.width, height: bounds.height };
  const width = Math.min(bounds.width, bounds.height * ratio);
  const height = width / ratio;
  return { x: (bounds.width - width) / 2, y: (bounds.height - height) / 2, width, height };
}

/** A frame held to a ratio around the same centre, as large as it can be while staying inside. */
export function applyRatio(rect: Rect, bounds: Size, ratio: number | null): Rect {
  if (!ratio) return rect;
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  const area = rect.width * rect.height;
  let width = Math.sqrt(area * ratio);
  // As large as the room around the centre allows.
  width = Math.min(width, 2 * Math.min(cx, bounds.width - cx), 2 * Math.min(cy, bounds.height - cy) * ratio);
  width = Math.max(width, Math.min(MIN_CROP * Math.max(1, ratio), bounds.width, bounds.height * ratio));
  const height = width / ratio;
  return {
    x: clamp(cx - width / 2, 0, bounds.width - width),
    y: clamp(cy - height / 2, 0, bounds.height - height),
    width,
    height,
  };
}

/**
 * The frame after the pointer moved by (dx, dy) picture pixels while holding `handle`.
 * `start` is the frame when the drag began, so the result never drifts.
 */
export function dragCrop(start: Rect, handle: Handle, dx: number, dy: number, bounds: Size, ratio: number | null): Rect {
  if (handle === 'move') {
    return { ...start, x: clamp(start.x + dx, 0, bounds.width - start.width), y: clamp(start.y + dy, 0, bounds.height - start.height) };
  }
  const left = start.x;
  const top = start.y;
  const right = start.x + start.width;
  const bottom = start.y + start.height;

  if (!ratio) {
    let l = left;
    let t = top;
    let r = right;
    let b = bottom;
    if (handle.includes('w')) l = clamp(left + dx, 0, right - MIN_CROP);
    if (handle.includes('e')) r = clamp(right + dx, left + MIN_CROP, bounds.width);
    if (handle.includes('n')) t = clamp(top + dy, 0, bottom - MIN_CROP);
    if (handle.includes('s')) b = clamp(bottom + dy, top + MIN_CROP, bounds.height);
    return { x: l, y: t, width: r - l, height: b - t };
  }

  const minWidth = Math.max(MIN_CROP, MIN_CROP * ratio);
  const sized = (width: number, max: number) => clamp(width, Math.min(minWidth, max), max);

  // Corners: the opposite corner stays where it is.
  if (handle.length === 2) {
    const east = handle.includes('e');
    const south = handle.includes('s');
    const fromX = start.width + (east ? dx : -dx);
    const fromY = (start.height + (south ? dy : -dy)) * ratio;
    // The axis the pointer moved most along leads.
    const wanted = Math.abs(fromX - start.width) >= Math.abs(fromY - start.width) ? fromX : fromY;
    const roomX = east ? bounds.width - left : right;
    const roomY = south ? bounds.height - top : bottom;
    const width = sized(wanted, Math.min(roomX, roomY * ratio));
    const height = width / ratio;
    return { x: east ? left : right - width, y: south ? top : bottom - height, width, height };
  }

  // Sides: the opposite side stays, the frame grows evenly on both other sides.
  const cx = left + start.width / 2;
  const cy = top + start.height / 2;
  if (handle === 'e' || handle === 'w') {
    const east = handle === 'e';
    const room = Math.min(east ? bounds.width - left : right, 2 * Math.min(cy, bounds.height - cy) * ratio);
    const width = sized(start.width + (east ? dx : -dx), room);
    const height = width / ratio;
    return { x: east ? left : right - width, y: cy - height / 2, width, height };
  }
  const south = handle === 's';
  const room = Math.min((south ? bounds.height - top : bottom) * ratio, 2 * Math.min(cx, bounds.width - cx));
  const width = sized((start.height + (south ? dy : -dy)) * ratio, room);
  const height = width / ratio;
  return { x: cx - width / 2, y: south ? top : bottom - height, width, height };
}

/** Whole pixels, still inside the picture: what the crop really uses. */
export function roundRect(rect: Rect, bounds: Size): Rect {
  const x = clamp(Math.round(rect.x), 0, bounds.width - 1);
  const y = clamp(Math.round(rect.y), 0, bounds.height - 1);
  return { x, y, width: clamp(Math.round(rect.width), 1, bounds.width - x), height: clamp(Math.round(rect.height), 1, bounds.height - y) };
}

/** Whether a frame covers (almost) the whole picture: cropping to it would change nothing. */
export function isWhole(rect: Rect, bounds: Size): boolean {
  return rect.x < 1 && rect.y < 1 && rect.width > bounds.width - 1 && rect.height > bounds.height - 1;
}
