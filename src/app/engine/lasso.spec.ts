import { describe, expect, it } from 'vitest';
import {
  clampPoint,
  closesShape,
  isNewPoint,
  isShape,
  shapeArea,
  shapePath,
  simplify,
} from './lasso';

const square = [
  { x: 0, y: 0 },
  { x: 10, y: 0 },
  { x: 10, y: 10 },
  { x: 0, y: 10 },
];

describe('lasso', () => {
  it('measures the area of a shape, in either direction', () => {
    expect(shapeArea(square)).toBe(100);
    expect(shapeArea([...square].reverse())).toBe(100);
    expect(
      shapeArea([
        { x: 0, y: 0 },
        { x: 5, y: 5 },
        { x: 10, y: 10 },
      ]),
    ).toBe(0);
  });

  it('tells a shape from a line or a few clicks on one spot', () => {
    expect(isShape(square)).toBe(true);
    expect(isShape(square.slice(0, 2))).toBe(false);
    expect(
      isShape([
        { x: 0, y: 0 },
        { x: 5, y: 5 },
        { x: 10, y: 10 },
      ]),
    ).toBe(false);
  });

  it('closes the shape on a click near its first point, on screen', () => {
    // 8 px of the picture at 1:1 are close enough; at 2× zoom (16 px on screen), not any more.
    expect(closesShape(square, { x: 8, y: 0 }, 1)).toBe(true);
    expect(closesShape(square, { x: 8, y: 0 }, 2)).toBe(false);
    // Two points are not a shape yet.
    expect(closesShape(square.slice(0, 2), { x: 0, y: 0 }, 1)).toBe(false);
  });

  it('keeps one point for a double click', () => {
    expect(isNewPoint([], { x: 0, y: 0 }, 1)).toBe(true);
    expect(isNewPoint(square, { x: 1, y: 10 }, 1)).toBe(false);
    expect(isNewPoint(square, { x: 5, y: 10 }, 1)).toBe(true);
    expect(isNewPoint(square, { x: 2, y: 10 }, 4)).toBe(true);
  });

  it('keeps points within the picture', () => {
    expect(clampPoint({ x: -4, y: 120 }, 100, 80)).toEqual({ x: 0, y: 80 });
    expect(clampPoint({ x: 30, y: 40 }, 100, 80)).toEqual({ x: 30, y: 40 });
  });

  it('simplifies a freehand line and keeps its corners', () => {
    const line = [];
    for (let x = 0; x <= 50; x++) line.push({ x, y: x % 2 ? 0.3 : 0 });
    for (let y = 1; y <= 50; y++) line.push({ x: 50, y });
    const simple = simplify(line, 1);
    expect(simple).toEqual([
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 50, y: 50 },
    ]);
    expect(simplify(square.slice(0, 2), 1)).toEqual(square.slice(0, 2));
  });

  it('writes the SVG path, open, closed, or around the shape', () => {
    expect(shapePath([], false)).toBe('');
    expect(shapePath(square.slice(0, 2), false)).toBe('M0 0L10 0');
    expect(shapePath(square, true)).toBe('M0 0L10 0L10 10L0 10Z');
    expect(shapePath(square, true, { width: 40, height: 30 })).toBe(
      'M0 0H40V30H0ZM0 0L10 0L10 10L0 10Z',
    );
    expect(shapePath([{ x: 1.234, y: 5.678 }], false)).toBe('M1.2 5.7');
  });
});
