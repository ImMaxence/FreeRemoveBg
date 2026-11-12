import { ChangeDetectionStrategy, Component, ElementRef, Injector, afterNextRender, computed, effect, inject, input, signal, untracked, viewChild } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { ImagesStore, type Item } from '../core/images.store';
import { MODELS, MODEL_IDS } from '../core/models';
import { HANDLES, type Handle, applyRatio, dragCrop, fitRatio, isWhole, roundRect } from '../engine/crop';
import { type Rect, areaBetween } from '../engine/prepare';
import { MAX_ZONES, newZone } from '../engine/zones';
import { Icon } from '../shared/icon';
import { canvasPixels, elementSize, fitSize } from './fit';

type RatioId = 'free' | 'original' | 'square' | 'portrait' | 'photo' | 'wide';

/**
 * Step 3, optional: the picture as it will be read by the AI, with what helps it: turning a
 * picture taken sideways, mirroring it, cropping around the subject, or drawing a zone around
 * each of several subjects.
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
  protected readonly models = MODELS;
  protected readonly modelIds = MODEL_IDS;

  protected readonly cropping = signal(false);
  protected readonly frame = signal<Rect | null>(null);
  protected readonly ratio = signal<RatioId>('free');
  protected readonly busy = signal(false);

  /** The "Zones" tool is open. */
  protected readonly zoning = signal(false);
  protected readonly maxZones = MAX_ZONES;
  /** Zones being moved or resized: shown at once, handed to the store on release. */
  private readonly movingZones = signal<Rect[] | null>(null);
  protected readonly zones = computed(() => this.movingZones() ?? this.item().zones);
  /** The zone being drawn. */
  protected readonly zoneDraft = signal<Rect | null>(null);
  private zoneDraw: { x: number; y: number } | null = null;
  private zoneDrag: { index: number; handle: Handle; x: number; y: number; start: Rect; scale: number } | null = null;
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

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
  private readonly source = computed(() => this.item().source);

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
    // Another picture, or a new version of this one: no frame left over. (The item itself
    // changes with every update, its thumbnail included: only its picture counts here.)
    effect(() => {
      this.source();
      untracked(() => {
        this.cancelCrop();
        this.zoneDraft.set(null);
        this.movingZones.set(null);
        this.zoneDraw = this.zoneDrag = null;
      });
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
    this.zoning.set(false);
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

  // --- Zones ----------------------------------------------------------------------------------

  protected toggleZones(): void {
    if (!this.zoning()) this.cancelCrop();
    this.zoning.update((on) => !on);
  }

  /** Where the pointer is, as fractions of the picture. */
  private fraction(event: PointerEvent): { x: number; y: number } {
    const rect = this.canvas()!.nativeElement.getBoundingClientRect();
    return { x: (event.clientX - rect.left) / rect.width, y: (event.clientY - rect.top) / rect.height };
  }

  /** A drag on the picture draws a new zone. */
  protected drawStart(event: PointerEvent): void {
    if (!this.zoning() || event.button !== 0 || this.zones().length >= MAX_ZONES) return;
    event.preventDefault();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    this.zoneDraw = this.fraction(event);
  }

  protected drawMove(event: PointerEvent): void {
    if (!this.zoneDraw) return;
    const item = this.item();
    const at = this.fraction(event);
    this.zoneDraft.set(areaBetween(this.zoneDraw.x, this.zoneDraw.y, at.x, at.y, item.width, item.height));
  }

  protected drawEnd(): void {
    const draft = this.zoneDraft();
    this.zoneDraw = null;
    this.zoneDraft.set(null);
    if (draft) this.store.setZones(this.item().id, [...this.zones(), roundRect(draft, this.item())]);
  }

  /** A zone is moved by dragging it, resized by its corner. */
  protected grabZone(event: PointerEvent, index: number, handle: Handle): void {
    const canvas = this.canvas()?.nativeElement;
    if (!this.zoning() || !canvas || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    this.zoneDrag = { index, handle, x: event.clientX, y: event.clientY, start: this.zones()[index], scale: this.item().width / canvas.getBoundingClientRect().width };
  }

  protected moveZone(event: PointerEvent): void {
    const drag = this.zoneDrag;
    if (!drag) return;
    const zones = [...this.zones()];
    zones[drag.index] = dragCrop(drag.start, drag.handle, (event.clientX - drag.x) * drag.scale, (event.clientY - drag.y) * drag.scale, this.item(), null);
    this.movingZones.set(zones);
  }

  protected releaseZone(): void {
    const moved = this.movingZones();
    this.zoneDrag = null;
    this.movingZones.set(null);
    if (moved) this.store.setZones(this.item().id, moved.map((zone) => roundRect(zone, this.item())));
  }

  protected removeZone(index: number): void {
    this.store.setZones(this.item().id, this.zones().filter((_, i) => i !== index));
  }

  protected clearZones(): void {
    this.store.setZones(this.item().id, []);
  }

  /** "Add a zone", for the keyboard: it gets the focus, then the arrows place it. */
  protected addZone(): void {
    const item = this.item();
    const zones = this.zones();
    if (zones.length >= MAX_ZONES) return;
    this.store.setZones(item.id, [...zones, newZone(item.width, item.height, zones.length)]);
    afterNextRender(() => this.host.nativeElement.querySelector<HTMLElement>(`[data-zone="${zones.length}"]`)?.focus(), { injector: this.injector });
  }

  /** Arrows move the zone, Shift + arrows resize it, Delete removes it. */
  protected onZoneKey(event: KeyboardEvent, index: number): void {
    const item = this.item();
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      this.removeZone(index);
      return;
    }
    const step = Math.max(1, Math.round(Math.max(item.width, item.height) / 100));
    const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const delta = moves[event.key];
    if (!delta) return;
    event.preventDefault();
    const zones = [...this.zones()];
    zones[index] = roundRect(dragCrop(zones[index], event.shiftKey ? 'se' : 'move', delta[0], delta[1], item, null), item);
    this.store.setZones(item.id, zones);
  }

  /** Each zone becomes a picture of its own. */
  protected async separate(): Promise<void> {
    this.zoning.set(false);
    await this.working(() => this.store.splitZones(this.item().id));
    // The first of the new pictures, from its top.
    window.scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }

  protected zoneSize(zone: Rect): string {
    return `${Math.round(zone.width)} × ${Math.round(zone.height)} px`;
  }

  // --- On to the cutout ------------------------------------------------------------------------

  protected async cutOut(all = false): Promise<void> {
    this.zoning.set(false);
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
