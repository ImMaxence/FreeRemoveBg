import { describe, expect, it } from 'vitest';
import { MAX_ZONES, newZone, zoneName } from './zones';

describe('zones', () => {
  it('names the picture made of each zone after the original', () => {
    expect(zoneName('dogs.jpg', 0)).toBe('dogs (1).jpg');
    expect(zoneName('my.photo.webp', 2)).toBe('my.photo (3).webp');
    expect(zoneName('picture', 0)).toBe('picture (1)');
    expect(zoneName('.hidden', 1)).toBe('.hidden (2)');
  });

  it('adds zones in the middle, each a little further, always inside the picture', () => {
    const first = newZone(900, 600, 0);
    expect(first).toEqual({ x: 300, y: 200, width: 300, height: 200 });
    const second = newZone(900, 600, 1);
    expect(second.x).toBeGreaterThan(first.x);
    expect(second.y).toBeGreaterThan(first.y);
    for (let count = 0; count < MAX_ZONES; count++) {
      const zone = newZone(901, 601, count);
      expect(zone.x + zone.width).toBeLessThanOrEqual(901);
      expect(zone.y + zone.height).toBeLessThanOrEqual(601);
    }
  });
});
