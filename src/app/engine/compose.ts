/**
 * Draws a picture: its background (none, a color, a gradient, another picture or the original
 * blurred), then the subject cut out by the mask. The preview and the downloads share this
 * code, so what is shown is what is saved.
 */

export type Background =
  | { kind: 'transparent' }
  | { kind: 'color'; color: string }
  | { kind: 'gradient'; from: string; to: string }
  | { kind: 'image'; image: CanvasImageSource; width: number; height: number; name: string }
  | { kind: 'blur'; amount: number };

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;

/** Blur radius of `amount` (0–100) on a picture this wide: the same look at every size. */
export function blurRadius(amount: number, width: number, height: number): number {
  return (amount / 100) * Math.max(width, height) * 0.04;
}

/** Where a `sw` × `sh` picture goes to cover a `dw` × `dh` area, centred, without distortion. */
export function coverRect(sw: number, sh: number, dw: number, dh: number): { x: number; y: number; width: number; height: number } {
  const scale = Math.max(dw / sw, dh / sh);
  const width = sw * scale;
  const height = sh * scale;
  return { x: (dw - width) / 2, y: (dh - height) / 2, width, height };
}

function drawBackground(ctx: Ctx, width: number, height: number, source: CanvasImageSource, background: Background): void {
  switch (background.kind) {
    case 'transparent':
      return;
    case 'color':
      ctx.fillStyle = background.color;
      ctx.fillRect(0, 0, width, height);
      return;
    case 'gradient': {
      const gradient = ctx.createLinearGradient(0, 0, width, height);
      gradient.addColorStop(0, background.from);
      gradient.addColorStop(1, background.to);
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);
      return;
    }
    case 'image': {
      const r = coverRect(background.width, background.height, width, height);
      ctx.drawImage(background.image, r.x, r.y, r.width, r.height);
      return;
    }
    case 'blur': {
      const radius = blurRadius(background.amount, width, height);
      if (radius < 0.5) {
        ctx.drawImage(source, 0, 0, width, height);
        return;
      }
      if ('filter' in ctx) {
        // Drawn larger than the frame: a blur fades to transparent near the edges.
        ctx.save();
        ctx.filter = `blur(${radius}px)`;
        const pad = radius * 2;
        ctx.drawImage(source, -pad, -pad, width + pad * 2, height + pad * 2);
        ctx.restore();
        return;
      }
      // Without canvas filters (older Safari): shrunk, then stretched back, which blurs too.
      const factor = Math.max(2, radius / 2);
      const small = new OffscreenCanvas(Math.max(1, Math.round(width / factor)), Math.max(1, Math.round(height / factor)));
      small.getContext('2d')!.drawImage(source, 0, 0, small.width, small.height);
      (ctx as Ctx).imageSmoothingQuality = 'high';
      (ctx as Ctx).drawImage(small, 0, 0, width, height);
      return;
    }
  }
}

/**
 * Draws onto `target` (already at the wanted size). `mask`: a picture whose opacity is the
 * subject; without it (not computed yet, or "original" view) the picture is drawn whole.
 * `scratch`: a canvas reused between calls to hold the cutout.
 */
export function compose(target: AnyCanvas, scratch: AnyCanvas, source: CanvasImageSource, mask: CanvasImageSource | null, background: Background): void {
  const { width, height } = target;
  const ctx = target.getContext('2d') as Ctx;
  ctx.clearRect(0, 0, width, height);
  ctx.imageSmoothingQuality = 'high';
  if (!mask) {
    ctx.drawImage(source, 0, 0, width, height);
    return;
  }
  if (scratch.width !== width || scratch.height !== height) {
    scratch.width = width;
    scratch.height = height;
  }
  const cut = scratch.getContext('2d') as Ctx;
  cut.globalCompositeOperation = 'copy';
  cut.imageSmoothingQuality = 'high';
  cut.drawImage(source, 0, 0, width, height);
  cut.globalCompositeOperation = 'destination-in';
  cut.drawImage(mask, 0, 0, width, height);
  cut.globalCompositeOperation = 'source-over';

  drawBackground(ctx, width, height, source, background);
  ctx.drawImage(scratch, 0, 0);
}

/** The model's opacities (a `size` × `size` square) as a picture: white where the subject is. */
export function alphaToImageData(alpha: Uint8ClampedArray, size: number): ImageData {
  const image = new ImageData(size, size);
  const data = image.data;
  data.fill(255);
  for (let i = 0; i < alpha.length; i++) data[i * 4 + 3] = alpha[i];
  return image;
}
