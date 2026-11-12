/**
 * Zones: several areas of one picture, drawn in the "Prepare" step around each subject (four dogs
 * on one photo…). Each is cut out by the AI on its own, at close range; the answers are put back
 * together on the whole picture, or each zone becomes a picture of its own. Framework-free,
 * covered by unit tests.
 */
import { roundRect } from './crop';
import type { Rect } from './prepare';

/** At most this many zones on one picture. */
export const MAX_ZONES = 12;

/** Name of the picture made of zone `index` (from 0): "dogs.jpg" → "dogs (1).jpg". */
export function zoneName(name: string, index: number): string {
  const dot = name.lastIndexOf('.');
  const base = dot > 0 ? name.slice(0, dot) : name;
  const extension = dot > 0 ? name.slice(dot) : '';
  return `${base} (${index + 1})${extension}`;
}

/**
 * A zone added with the keyboard (or a button): a third of the picture, in the middle, moved a
 * little for each zone already there so that they do not hide each other.
 */
export function newZone(width: number, height: number, count: number): Rect {
  const w = width / 3;
  const h = height / 3;
  const shift = (count % 5) * 0.05;
  return roundRect(
    {
      x: Math.min(width - w, width / 3 + width * shift),
      y: Math.min(height - h, height / 3 + height * shift),
      width: w,
      height: h,
    },
    { width, height },
  );
}
