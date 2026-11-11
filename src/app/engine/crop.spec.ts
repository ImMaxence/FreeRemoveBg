import { describe, expect, it } from 'vitest';
import { MIN_CROP, applyRatio, dragCrop, fitRatio, isWhole, roundRect } from './crop';

const bounds = { width: 1000, height: 800 };
const frame = { x: 100, y: 100, width: 400, height: 300 };

describe('crop frame', () => {
  it('fits the largest frame of a ratio, centred', () => {
    expect(fitRatio(bounds, null)).toEqual({ x: 0, y: 0, width: 1000, height: 800 });
    expect(fitRatio(bounds, 1)).toEqual({ x: 100, y: 0, width: 800, height: 800 });
    expect(fitRatio(bounds, 16 / 9)).toEqual({ x: 0, y: (800 - 562.5) / 2, width: 1000, height: 562.5 });
  });

  it('moves the frame without leaving the picture', () => {
    expect(dragCrop(frame, 'move', 50, -20, bounds, null)).toEqual({ ...frame, x: 150, y: 80 });
    expect(dragCrop(frame, 'move', 5000, 5000, bounds, null)).toEqual({ ...frame, x: 600, y: 500 });
    expect(dragCrop(frame, 'move', -5000, -5000, bounds, null)).toEqual({ ...frame, x: 0, y: 0 });
  });

  it('resizes freely from a side or a corner, the opposite one staying', () => {
    expect(dragCrop(frame, 'e', 100, 0, bounds, null)).toEqual({ x: 100, y: 100, width: 500, height: 300 });
    expect(dragCrop(frame, 'nw', -50, -50, bounds, null)).toEqual({ x: 50, y: 50, width: 450, height: 350 });
    // Never smaller than the minimum, never past the picture.
    expect(dragCrop(frame, 'w', 1000, 0, bounds, null).width).toBe(MIN_CROP);
    expect(dragCrop(frame, 'se', 5000, 5000, bounds, null)).toEqual({ x: 100, y: 100, width: 900, height: 700 });
  });

  it('keeps a ratio from a corner', () => {
    const square = { x: 100, y: 100, width: 300, height: 300 };
    const r = dragCrop(square, 'se', 100, 20, bounds, 1);
    expect(r.width).toBe(400);
    expect(r.height).toBe(400);
    expect(r.x).toBe(100);
    expect(r.y).toBe(100);
    // Held inside the picture: 700 px of room below the frame.
    const big = dragCrop(square, 'se', 5000, 0, bounds, 1);
    expect(big.width).toBe(700);
    expect(big.height).toBe(700);
    // From the top-left corner, the bottom-right one stays.
    const nw = dragCrop(square, 'nw', -50, 0, bounds, 1);
    expect(nw.x + nw.width).toBe(400);
    expect(nw.y + nw.height).toBe(400);
  });

  it('keeps a ratio from a side, growing evenly', () => {
    const square = { x: 300, y: 300, width: 200, height: 200 };
    const r = dragCrop(square, 'e', 100, 0, bounds, 1);
    expect(r).toEqual({ x: 300, y: 250, width: 300, height: 300 });
  });

  it('applies a ratio around the same centre, inside the picture', () => {
    const r = applyRatio({ x: 0, y: 0, width: 1000, height: 800 }, bounds, 1);
    expect(r.width).toBe(r.height);
    expect(r.width).toBeLessThanOrEqual(800);
    expect(r.x + r.width).toBeLessThanOrEqual(1000);
    expect(applyRatio(frame, bounds, null)).toBe(frame);
  });

  it('rounds to whole pixels inside the picture', () => {
    expect(roundRect({ x: 10.4, y: 20.6, width: 99.5, height: 50.2 }, bounds)).toEqual({ x: 10, y: 21, width: 100, height: 50 });
    expect(roundRect({ x: 990, y: 0, width: 40, height: 10 }, bounds)).toEqual({ x: 990, y: 0, width: 10, height: 10 });
  });

  it('knows when a frame changes nothing', () => {
    expect(isWhole({ x: 0, y: 0, width: 1000, height: 800 }, bounds)).toBe(true);
    expect(isWhole(frame, bounds)).toBe(false);
  });
});
