import { describe, expect, it } from 'vitest';
import { PREFER_LARGER_MARGIN, SAM_INPUT, bestMask, boxToSamInput, chooseMask, samAlpha, samWorkSize, toSamInput } from './sam';

/** Three `low` × `low` candidates, the i-th one covering the first `sizes[i]` cells. */
function candidates(low: number, sizes: number[]): Float32Array {
  const area = low * low;
  const data = new Float32Array(area * sizes.length).fill(-5);
  sizes.forEach((size, i) => data.fill(5, i * area, i * area + size));
  return data;
}

describe('sam', () => {
  it('reads a copy of the picture of at most 1024 px, same shape', () => {
    expect(samWorkSize(4000, 3000)).toEqual({ width: 1024, height: 768 });
    expect(samWorkSize(600, 1200)).toEqual({ width: 512, height: 1024 });
    // A small picture is not enlarged.
    expect(samWorkSize(300, 200)).toEqual({ width: 300, height: 200 });
    expect(samWorkSize(5000, 2)).toEqual({ width: 1024, height: 1 });
  });

  it('places points and boxes in its square', () => {
    expect(toSamInput({ x: 512, y: 192, positive: true }, 1024, 768)).toEqual([512, 256]);
    expect(boxToSamInput({ x: 0, y: 0, width: 512, height: 384 }, 1024, 768)).toEqual([0, 0, 512, 512]);
    expect(boxToSamInput({ x: 100, y: 50, width: 100, height: 50 }, 200, 100)).toEqual([512, 512, SAM_INPUT, SAM_INPUT]);
  });

  it('finds its most confident candidate', () => {
    expect(bestMask([0.2, 0.9, 0.5])).toBe(1);
    expect(bestMask([0.7])).toBe(0);
  });

  it('prefers the whole object to a part when nearly as confident', () => {
    const masks = candidates(4, [2, 6, 12]);
    // The best one is the part; the whole object is within the margin.
    expect(chooseMask([0.95, 0.9, 0.95 - PREFER_LARGER_MARGIN + 0.01], masks, 4, true)).toBe(2);
    // Too far below: the best one stays.
    expect(chooseMask([0.95, 0.9, 0.95 - PREFER_LARGER_MARGIN - 0.05], masks, 4, true)).toBe(1);
    // Refining clicks or a box: always the best one.
    expect(chooseMask([0.95, 0.9, 0.94], masks, 4, false)).toBe(0);
  });

  it('enlarges a candidate into opacities, sharp at the outline', () => {
    // A 2 × 2 grid: left column inside, right column outside.
    const scores = new Float32Array([8, -8, 8, -8]);
    const alpha = samAlpha(scores, 0, 2, 4, 2);
    expect(alpha.length).toBe(8);
    // Outer columns keep the grid's answer, the middle ones blend into the outline.
    expect(alpha[0]).toBe(255);
    expect(alpha[3]).toBe(0);
    expect(alpha[1]).toBeGreaterThan(200);
    expect(alpha[2]).toBeLessThan(55);
    // Rows are the same.
    expect(Array.from(alpha.slice(0, 4))).toEqual(Array.from(alpha.slice(4)));
  });

  it('reads the right candidate out of the three', () => {
    const low = 2;
    const data = new Float32Array([-9, -9, -9, -9, 9, 9, 9, 9, -9, -9, -9, -9]);
    expect(Array.from(samAlpha(data, low * low, low, 2, 2))).toEqual([255, 255, 255, 255]);
    expect(Array.from(samAlpha(data, 0, low, 2, 2))).toEqual([0, 0, 0, 0]);
  });
});
