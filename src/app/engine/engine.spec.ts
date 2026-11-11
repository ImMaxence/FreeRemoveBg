import { describe, expect, it } from 'vitest';
import { blurRadius, coverRect } from './compose';
import { exportName, isImageFile, megapixels } from './files';
import { alphaFromScores, halfToFloat, maskSize, pixelsToInput, workingSize } from './mask';
import { crc32, uniqueNames, zip } from './zip';

describe('mask', () => {
  it('turns pixels into normalised planes', () => {
    // One red pixel and one white pixel.
    const pixels = new Uint8ClampedArray([255, 0, 0, 255, 255, 255, 255, 255]);
    const input = pixelsToInput(pixels, 1, [0.5, 0.5, 0.5], [1, 1, 1]);
    expect(Array.from(input)).toEqual([0.5, -0.5, -0.5]);
  });

  it('reads half-precision floats', () => {
    expect(halfToFloat(0x3c00)).toBe(1);
    expect(halfToFloat(0xc000)).toBe(-2);
    expect(halfToFloat(0x0000)).toBe(0);
    expect(halfToFloat(0x3800)).toBe(0.5);
  });

  it('keeps a ready mask as it is', () => {
    expect(Array.from(alphaFromScores(new Float32Array([0, 0.5, 1]), 3))).toEqual([0, 128, 255]);
  });

  it('applies a sigmoid to raw scores', () => {
    const alpha = alphaFromScores(new Float32Array([-20, 0, 20]), 3);
    expect(Array.from(alpha)).toEqual([0, 128, 255]);
  });

  it('sizes the mask and the working picture', () => {
    expect(maskSize(4000, 3000)).toEqual({ width: 2048, height: 1536 });
    expect(maskSize(800, 600)).toEqual({ width: 800, height: 600 });
    expect(workingSize(4000, 3000, 25e6)).toEqual({ width: 4000, height: 3000 });
    const shrunk = workingSize(8000, 6000, 25e6);
    expect(shrunk.width * shrunk.height).toBeLessThanOrEqual(25e6 * 1.001);
    expect(shrunk.width / shrunk.height).toBeCloseTo(4 / 3, 2);
  });
});

describe('compose', () => {
  it('covers an area without distortion', () => {
    expect(coverRect(100, 100, 200, 100)).toEqual({ x: 0, y: -50, width: 200, height: 200 });
    expect(coverRect(200, 100, 100, 100)).toEqual({ x: -50, y: 0, width: 200, height: 100 });
  });

  it('scales the blur with the picture', () => {
    expect(blurRadius(0, 1000, 500)).toBe(0);
    expect(blurRadius(50, 2000, 1000)).toBe(2 * blurRadius(50, 1000, 500));
  });
});

describe('files', () => {
  it('names the saved picture after the original', () => {
    expect(exportName('IMG_0042.JPG', 'png')).toBe('IMG_0042-no-bg.png');
    expect(exportName('my.holiday.photo.jpeg', 'webp')).toBe('my.holiday.photo-no-bg.webp');
    expect(exportName('a/b:c?.png', 'jpg')).toBe('abc-no-bg.jpg');
    expect(exportName('', 'png')).toBe('image-no-bg.png');
  });

  it('tells pictures from other files', () => {
    expect(isImageFile({ type: 'image/png', name: 'a' })).toBe(true);
    expect(isImageFile({ type: 'image/svg+xml', name: 'a.svg' })).toBe(false);
    expect(isImageFile({ type: 'application/pdf', name: 'a.pdf' })).toBe(false);
    expect(isImageFile({ type: '', name: 'photo.HEIC' })).toBe(true);
    expect(isImageFile({ type: '', name: 'notes.txt' })).toBe(false);
  });

  it('formats megapixels', () => {
    expect(megapixels(960, 1200)).toBe('1.2 MP');
    expect(megapixels(6000, 4000)).toBe('24 MP');
  });
});

describe('zip', () => {
  it('computes CRC-32', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });

  it('keeps names unique', () => {
    expect(uniqueNames(['a.png', 'b.png', 'A.png', 'a.png'])).toEqual(['a.png', 'b.png', 'A (2).png', 'a (3).png']);
  });

  it('writes a readable archive', async () => {
    const data = new TextEncoder().encode('hello');
    const bytes = new Uint8Array(await zip([{ name: 'été.txt', data }], new Date(2026, 10, 11, 12, 0, 0)).arrayBuffer());
    const view = new DataView(bytes.buffer);
    const name = new TextEncoder().encode('été.txt');
    // Local header, name, data, central directory, end record.
    expect(bytes.length).toBe(30 + name.length + data.length + 46 + name.length + 22);
    expect(view.getUint32(0, true)).toBe(0x04034b50);
    expect(view.getUint32(14, true)).toBe(crc32(data));
    expect(view.getUint32(18, true)).toBe(data.length);
    expect(new TextDecoder().decode(bytes.slice(30 + name.length, 30 + name.length + data.length))).toBe('hello');
    const end = bytes.length - 22;
    expect(view.getUint32(end, true)).toBe(0x06054b50);
    expect(view.getUint16(end + 10, true)).toBe(1);
    expect(view.getUint32(end + 16, true)).toBe(30 + name.length + data.length);
  });
});
