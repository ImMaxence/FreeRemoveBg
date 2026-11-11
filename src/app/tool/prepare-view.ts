import { ChangeDetectionStrategy, Component, type ElementRef, computed, effect, inject, input, signal, untracked, viewChild } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { ImagesStore, type Item } from '../core/images.store';
import { HANDLES, type Handle, applyRatio, dragCrop, fitRatio, isWhole, roundRect } from '../engine/crop';
import type { Rect } from '../engine/prepare';
import { Icon } from '../shared/icon';
import { canvasPixels, elementSize, fitSize } from './fit';

type RatioId = 'free' | 'original' | 'square' | 'portrait' | 'photo' | 'wide';

/**
 * Step 3, optional: the picture as it will be read by the AI, with what helps it: turning a
 * picture taken sideways, mirroring it, and cropping around the subject.
 */
@Component({
  selector: 'app-prepare-view',
  imports: [TranslocoPipe, Icon],
  templateUrl: './prepare-view.html',
  styleUrl: './view.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'view' },
})
export class PrepareView {
  readonly item = input.required<Item>();
  protected readonly store = inject(ImagesStore);
  protected readonly handles = HANDLES;
  protected readonly ratios: RatioId[] = ['free', 'original', 'square', 'portrait', 'photo', 'wide'];

  protected readonly cropping = signal(false);
  protected readonly frame = signal<Rect | null>(null);
  protected readonly ratio = signal<RatioId>('free');
  protected readonly busy = signal(false);

  private readonly viewport = viewChild<ElementRef<HTMLElement>>('viewport');
  private readonly canvas = viewChild<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly box = elementSize(this.viewport);
  protected readonly display = computed(() => fitSize(this.item().width, this.item().height, this.box()));
  protected readonly modified = computed(() => this.item().source !== this.item().original);
  protected readonly otherDrafts = computed(() => this.store.drafts().filter((d) => d.id !== this.item().id).length);
  protected readonly modelPercent = computed(() => Math.round((this.store.modelDownload()?.progress ?? 0) * 100));
  /** The frame in pixels, for the people who read numbers (and screen readers). */
  protected readonly frameSize = computed(() => {
    const f = this.frame();
    return f ? `${Math.round(f.width)} × ${Math.round(f.height)} px` : '';
  });

  private drag: { handle: Handle; x: number; y: number; start: Rect; scale: number } | null = null;

  constructor() {
    // Redraws the picture when it changes or when its place on screen does.
    effect(() => {
      const item = this.item();
      const canvas = this.canvas()?.nativeElement;
      const display = this.display();
      item.revision;
      if (!canvas || !display.width) return;
      untracked(() => {
        const pixels = canvasPixels(item, display);
        canvas.width = pixels.width;
        canvas.height = pixels.height;
        const ctx = canvas.getContext('2d')!;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(item.source, 0, 0, pixels.width, pixels.height);
      });
    });
    // Another picture, or a new version of this one: no frame left over.
    effect(() => {
      this.item().source;
      untracked(() => this.cancelCrop());
    });
  }

  private ratioValue(id: RatioId): number | null {
    const item = this.item();
    return { free: null, original: item.width / item.height, square: 1, portrait: 4 / 5, photo: 3 / 2, wide: 16 / 9 }[id];
  }

  // --- Turning ---------------------------------------------------------------------------------

  protected async rotate(quarter: 1 | -1): Promise<void> {
    await this.working(() => this.store.rotate(this.item().id, quarter));
  }

  protected async flip(): Promise<void> {
    await this.working(() => this.store.flip(this.item().id));
  }

  protected async restore(): Promise<void> {
    await this.working(() => this.store.restoreOriginal(this.item().id));
  }

  // --- Cropping --------------------------------------------------------------------------------

  protected startCrop(): void {
    const item = this.item();
    this.cropping.set(true);
    // A frame slightly inside the picture, so its handles are easy to see and grab.
    const whole = fitRatio(item, this.ratioValue(this.ratio()));
    const inset = 0.08;
    this.frame.set({ x: whole.x + whole.width * inset, y: whole.y + whole.height * inset, width: whole.width * (1 - 2 * inset), height: whole.height * (1 - 2 * inset) });
  }

  protected setRatio(id: RatioId): void {
    this.ratio.set(id);
    const frame = this.frame();
    if (frame) this.frame.set(applyRatio(frame, this.item(), this.ratioValue(id)));
  }

  protected cancelCrop(): void {
    this.cropping.set(false);
    this.frame.set(null);
    this.drag = null;
  }

  protected async applyCrop(): Promise<void> {
    const item = this.item();
    const frame = this.frame();
    this.cancelCrop();
    if (!frame || isWhole(frame, item)) return;
    await this.working(() => this.store.crop(item.id, roundRect(frame, item)));
  }

  protected grab(event: PointerEvent, handle: Handle): void {
    const frame = this.frame();
    const canvas = this.canvas()?.nativeElement;
    if (!frame || !canvas || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    this.drag = { handle, x: event.clientX, y: event.clientY, start: frame, scale: this.item().width / canvas.getBoundingClientRect().width };
  }

  protected move(event: PointerEvent): void {
    const drag = this.drag;
    if (!drag) return;
    const dx = (event.clientX - drag.x) * drag.scale;
    const dy = (event.clientY - drag.y) * drag.scale;
    this.frame.set(dragCrop(drag.start, drag.handle, dx, dy, this.item(), this.ratioValue(this.ratio())));
  }

  protected release(): void {
    this.drag = null;
  }

  /** Arrows move the frame, Shift + arrows resize it, Enter applies, Escape cancels. */
  protected onCropKey(event: KeyboardEvent): void {
    const frame = this.frame();
    if (!frame) return;
    const item = this.item();
    if (event.key === 'Enter') {
      event.preventDefault();
      void this.applyCrop();
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      this.cancelCrop();
      return;
    }
    const step = Math.max(1, Math.round(Math.max(item.width, item.height) / 100));
    const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const delta = moves[event.key];
    if (!delta) return;
    event.preventDefault();
    this.frame.set(dragCrop(frame, event.shiftKey ? 'se' : 'move', delta[0], delta[1], item, this.ratioValue(this.ratio())));
  }

  // --- On to the cutout ------------------------------------------------------------------------

  protected async cutOut(all = false): Promise<void> {
    // A frame being drawn is what the user wants: it is applied first.
    if (this.cropping()) await this.applyCrop();
    this.store.start(all ? undefined : [this.item().id]);
  }

  private async working(task: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    try {
      await task();
    } finally {
      this.busy.set(false);
    }
  }

  protected percent(value: number, of: number): number {
    return (value / of) * 100;
  }
}
