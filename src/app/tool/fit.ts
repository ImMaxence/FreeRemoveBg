import { DestroyRef, type ElementRef, type Signal, effect, inject, signal } from '@angular/core';

export interface Size {
  width: number;
  height: number;
}

/**
 * The size of an element's content box, followed as the window or the layout changes.
 * To call in an injection context (a constructor or a field initialiser).
 */
export function elementSize(element: Signal<ElementRef<HTMLElement> | undefined>): Signal<Size> {
  const size = signal<Size>({ width: 0, height: 0 });
  const observer = new ResizeObserver(([entry]) => size.set({ width: Math.floor(entry.contentRect.width), height: Math.floor(entry.contentRect.height) }));
  effect((onCleanup) => {
    const el = element()?.nativeElement;
    if (!el) return;
    observer.observe(el);
    onCleanup(() => observer.unobserve(el));
  });
  inject(DestroyRef).onDestroy(() => observer.disconnect());
  return size.asReadonly();
}

/** Size on screen of a `width` × `height` picture fitted into a box (never enlarged), times a zoom. */
export function fitSize(width: number, height: number, box: Size, zoom = 1): Size {
  if (!box.width || !box.height) return { width: 0, height: 0 };
  const fit = Math.min(box.width / width, box.height / height, 1);
  return { width: Math.max(1, Math.round(width * fit * zoom)), height: Math.max(1, Math.round(height * fit * zoom)) };
}

/** Pixels of a canvas showing a picture at a size on screen: sharp, but never above the picture's own. */
export function canvasPixels(picture: Size, display: Size, maxSide = 4096): Size {
  const ratio = Math.min(globalThis.devicePixelRatio || 1, picture.width / display.width, maxSide / Math.max(display.width, display.height));
  return { width: Math.max(1, Math.round(display.width * ratio)), height: Math.max(1, Math.round(display.height * ratio)) };
}
