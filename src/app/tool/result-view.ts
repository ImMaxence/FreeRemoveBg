import { ChangeDetectionStrategy, Component, DestroyRef, type ElementRef, computed, effect, inject, input, signal, untracked, viewChild } from '@angular/core';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { ImagesStore, type Item } from '../core/images.store';
import { MODELS } from '../core/models';
import { REPO_URL } from '../core/version';
import { type Background, compose } from '../engine/compose';
import { ACCEPTED_TYPES, EXPORT_FORMATS, type ExportFormat } from '../engine/files';
import { type Rect, areaBetween } from '../engine/prepare';
import { DownloadProgress } from '../shared/download-progress';
import { Icon } from '../shared/icon';
import { canvasPixels, elementSize, fitSize } from './fit';

type Tool = 'move' | 'erase' | 'restore' | 'rescue';
type Tab = 'background' | 'retouch';
type BackgroundKind = Background['kind'];

const ZOOMS = [1, 1.5, 2, 3, 4, 6, 8];

/**
 * Step 4: the cutout. Background, retouching (eraser, restore brush, and "rescue" an area the
 * AI missed) and export. While the AI works, the same place shows its progress.
 */
@Component({
  selector: 'app-result-view',
  imports: [TranslocoPipe, Icon, DownloadProgress],
  templateUrl: './result-view.html',
  styleUrl: './view.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'view', '(document:keydown)': 'onKey($event)' },
})
export class ResultView {
  readonly item = input.required<Item>();
  protected readonly store = inject(ImagesStore);
  private readonly transloco = inject(TranslocoService);
  protected readonly repoUrl = REPO_URL;
  protected readonly accept = ACCEPTED_TYPES;
  protected readonly models = MODELS;
  protected readonly formats = Object.keys(EXPORT_FORMATS) as ExportFormat[];
  protected readonly kinds: { id: BackgroundKind; icon: string }[] = [
    { id: 'transparent', icon: 'layers' },
    { id: 'color', icon: 'palette' },
    { id: 'gradient', icon: 'gradient' },
    { id: 'image', icon: 'image' },
    { id: 'blur', icon: 'droplet' },
  ];
  protected readonly tools: { id: Tool; icon: string; key: string }[] = [
    { id: 'move', icon: 'hand', key: 'V' },
    { id: 'erase', icon: 'eraser', key: 'E' },
    { id: 'restore', icon: 'brush', key: 'R' },
    { id: 'rescue', icon: 'select', key: 'Z' },
  ];
  protected readonly colors = ['#ffffff', '#f5f0e6', '#16140f', '#ffd60a', '#ff6b4a', '#ff8fb1', '#7cc6fe', '#5b6cff', '#3fb37f', '#c9b8ff'];
  protected readonly gradients: [string, string][] = [
    ['#ffd60a', '#ff8a00'],
    ['#ffe3ec', '#ff8fb1'],
    ['#d4f1ff', '#5b6cff'],
    ['#e2ffe9', '#3fb37f'],
    ['#f5f0e6', '#cbbfa8'],
    ['#2b2824', '#0d0c0a'],
  ];

  protected readonly tab = signal<Tab>('background');
  protected readonly view = signal<'result' | 'original'>('result');
  protected readonly tool = signal<Tool>('move');
  protected readonly brush = signal(36);
  protected readonly zoom = signal(1);
  protected readonly format = signal<ExportFormat>('png');
  protected readonly saving = signal(false);
  protected readonly copied = signal<'ok' | 'error' | null>(null);
  protected readonly rescueFailed = signal(false);
  /** Brush outline following the mouse, in pixels of the frame. */
  protected readonly cursor = signal<{ x: number; y: number } | null>(null);
  /** The area drawn with the rescue tool, in pixels of the picture. */
  protected readonly area = signal<Rect | null>(null);
  /** The background panel shown; "image" stays open while no picture is chosen. */
  protected readonly panel = signal<BackgroundKind>('transparent');

  protected readonly done = computed(() => this.item().status === 'done');
  protected readonly canRetouch = computed(() => this.done() && this.view() === 'result');
  protected readonly brushing = computed(() => (this.tool() === 'erase' || this.tool() === 'restore') && this.canRetouch());
  protected readonly rescuing = computed(() => this.tool() === 'rescue' && this.canRetouch());
  protected readonly otherDrafts = computed(() => this.store.drafts().filter((d) => d.id !== this.item().id));
  protected readonly modelPercent = computed(() => Math.round((this.store.modelDownload()?.progress ?? 0) * 100));
  /** One sentence for screen readers, announced when the state of the picture changes. */
  protected readonly statusKey = computed(() => {
    const status = this.item().status;
    if (status === 'done') return 'tool.status.done';
    if (status === 'error') return 'tool.status.error';
    if (this.store.modelState() === 'downloading') return 'tool.status.download';
    return this.store.progress()?.stage === 'load' || this.store.modelState() === 'preparing' ? 'tool.status.load' : 'tool.status.run';
  });

  private readonly viewport = viewChild<ElementRef<HTMLElement>>('viewport');
  private readonly canvas = viewChild<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly box = elementSize(this.viewport);
  protected readonly display = computed(() => fitSize(this.item().width, this.item().height, this.box(), this.zoom()));
  private readonly scratch = document.createElement('canvas');
  private stroke: { id: number; x: number; y: number } | null = null;
  private drag: { x: number; y: number } | null = null;
  private frame = 0;
  private lastColor = '#ffffff';
  private lastGradient: [string, string] = this.gradients[0];
  private lastImage: Extract<Background, { kind: 'image' }> | null = null;
  private lastBlur = 40;

  constructor() {
    inject(DestroyRef).onDestroy(() => cancelAnimationFrame(this.frame));
    // Redraws whenever the picture, its mask, the background, the view or the size change.
    effect(() => {
      const item = this.item();
      const canvas = this.canvas()?.nativeElement;
      const display = this.display();
      const background = this.store.background();
      const original = this.view() === 'original';
      item.revision;
      if (!canvas || !display.width) return;
      untracked(() => this.draw(canvas, item, display, background, original));
    });
    // Another picture starts fitted, on the result, with its tools put away.
    effect(() => {
      this.item().id;
      untracked(() => {
        this.zoom.set(1);
        this.view.set('result');
        this.area.set(null);
      });
    });
    // The panel follows the background, also when it changes elsewhere.
    effect(() => {
      const kind = this.store.background().kind;
      untracked(() => {
        if (this.panel() !== 'image' || kind === 'image') this.panel.set(kind);
      });
    });
  }

  private draw(canvas: HTMLCanvasElement, item: Item, display: { width: number; height: number }, background: Background, original: boolean): void {
    const pixels = canvasPixels(item, display);
    if (canvas.width !== pixels.width || canvas.height !== pixels.height) {
      canvas.width = pixels.width;
      canvas.height = pixels.height;
    }
    compose(canvas, this.scratch, item.source, original || !item.mask ? null : item.mask, background);
  }

  private redrawSoon(): void {
    cancelAnimationFrame(this.frame);
    this.frame = requestAnimationFrame(() => {
      const canvas = this.canvas()?.nativeElement;
      if (canvas) this.draw(canvas, this.item(), this.display(), this.store.background(), false);
    });
  }

  protected backToPrepare(): void {
    const item = this.item();
    if (item.undo.length && !confirm(this.transloco.translate('tool.result.backConfirm'))) return;
    this.store.backToPrepare(item.id);
  }

  protected prepareNext(): void {
    const next = this.otherDrafts()[0];
    if (next) this.store.selectedId.set(next.id);
  }

  // --- Tabs ------------------------------------------------------------------------------------

  protected onTabKey(event: KeyboardEvent): void {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const next: Tab = this.tab() === 'background' ? 'retouch' : 'background';
    this.tab.set(next);
    (event.currentTarget as HTMLElement).parentElement?.querySelector<HTMLElement>(`#tab-${next}`)?.focus();
  }

  // --- Background ------------------------------------------------------------------------------

  protected openKind(kind: BackgroundKind): void {
    this.panel.set(kind);
    switch (kind) {
      case 'transparent':
        return this.store.background.set({ kind });
      case 'color':
        return this.store.background.set({ kind, color: this.lastColor });
      case 'gradient':
        return this.store.background.set({ kind, from: this.lastGradient[0], to: this.lastGradient[1] });
      case 'blur':
        return this.store.background.set({ kind, amount: this.lastBlur });
      case 'image':
        // Without a picture yet, the panel shows the button to choose one and nothing changes.
        if (this.lastImage) this.store.background.set(this.lastImage);
        return;
    }
  }

  protected setColor(color: string): void {
    this.lastColor = color;
    this.store.background.set({ kind: 'color', color });
  }

  protected setGradient(from: string, to: string): void {
    this.lastGradient = [from, to];
    this.store.background.set({ kind: 'gradient', from, to });
  }

  protected setBlur(amount: number): void {
    this.lastBlur = amount;
    this.store.background.set({ kind: 'blur', amount });
  }

  protected async onBackgroundPick(picker: HTMLInputElement): Promise<void> {
    const file = picker.files?.[0];
    picker.value = '';
    if (!file) return;
    try {
      const image = await createImageBitmap(file, { imageOrientation: 'from-image' });
      this.lastImage = { kind: 'image', image, width: image.width, height: image.height, name: file.name };
      this.store.background.set(this.lastImage);
    } catch {
      this.store.rejected.set([file.name]);
    }
  }

  // --- Retouching ------------------------------------------------------------------------------

  protected setTool(tool: Tool): void {
    this.tool.set(tool);
    if (tool !== 'move') this.view.set('result');
    if (tool !== 'rescue') this.area.set(null);
  }

  protected zoomBy(step: 1 | -1): void {
    const index = ZOOMS.indexOf(this.zoom());
    this.zoom.set(ZOOMS[Math.max(0, Math.min(ZOOMS.length - 1, index + step))]);
  }

  protected onWheel(event: WheelEvent): void {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    this.zoomBy(event.deltaY < 0 ? 1 : -1);
  }

  private fraction(event: PointerEvent): { x: number; y: number } {
    const rect = this.canvas()!.nativeElement.getBoundingClientRect();
    return { x: (event.clientX - rect.left) / rect.width, y: (event.clientY - rect.top) / rect.height };
  }

  private maskPoint(event: PointerEvent, item: Item): { x: number; y: number; scale: number } {
    const rect = this.canvas()!.nativeElement.getBoundingClientRect();
    const scale = item.mask!.width / rect.width;
    return { x: (event.clientX - rect.left) * scale, y: (event.clientY - rect.top) * scale, scale };
  }

  protected onPointerDown(event: PointerEvent): void {
    const item = this.item();
    if (event.button !== 0) return;
    if (this.rescuing()) {
      event.preventDefault();
      (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
      this.drag = this.fraction(event);
      this.area.set(null);
      return;
    }
    if (!this.brushing() || !item.mask) return;
    event.preventDefault();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    this.store.beginStroke(item.id);
    const point = this.maskPoint(event, item);
    this.stroke = { id: item.id, x: point.x, y: point.y };
    this.paint(item, point.x, point.y, point.x, point.y, point.scale);
  }

  protected onPointerMove(event: PointerEvent): void {
    const item = this.item();
    if (this.drag) {
      const point = this.fraction(event);
      this.area.set(areaBetween(this.drag.x, this.drag.y, point.x, point.y, item.width, item.height));
      return;
    }
    const canvas = this.canvas()?.nativeElement;
    if (canvas && this.brushing() && event.pointerType === 'mouse') {
      const rect = canvas.getBoundingClientRect();
      this.cursor.set({ x: event.clientX - rect.left, y: event.clientY - rect.top });
    }
    if (!this.stroke || !item.mask || item.id !== this.stroke.id) return;
    // Every position the pointer went through, not only the last of the frame: smoother lines.
    for (const e of event.getCoalescedEvents?.() ?? [event]) {
      const point = this.maskPoint(e, item);
      this.paint(item, this.stroke.x, this.stroke.y, point.x, point.y, point.scale);
      this.stroke.x = point.x;
      this.stroke.y = point.y;
    }
  }

  protected onPointerUp(): void {
    this.drag = null;
    if (!this.stroke) return;
    this.store.touch(this.stroke.id, true);
    this.stroke = null;
  }

  private paint(item: Item, x0: number, y0: number, x1: number, y1: number, scale: number): void {
    const ctx = item.mask!.getContext('2d')!;
    const erase = this.tool() === 'erase';
    // The brush keeps its size on screen, whatever the zoom.
    const width = Math.max(1, this.brush() * scale);
    ctx.save();
    ctx.globalCompositeOperation = erase ? 'destination-out' : 'source-over';
    ctx.strokeStyle = ctx.shadowColor = erase ? '#000' : '#fff';
    // A slightly soft edge, so retouches blend with the AI's outline.
    ctx.shadowBlur = width * 0.12;
    ctx.lineWidth = width * 0.88;
    ctx.lineCap = ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
    ctx.restore();
    this.redrawSoon();
  }

  protected async rescue(): Promise<void> {
    const area = this.area();
    if (!area) return;
    this.area.set(null);
    this.setTool('move');
    this.rescueFailed.set(false);
    try {
      await this.store.rescue(this.item().id, area);
    } catch (e) {
      console.error(e);
      this.rescueFailed.set(true);
    }
  }

  protected onKey(event: KeyboardEvent): void {
    const target = event.target as HTMLElement | null;
    if (target?.closest('input, textarea, select, [contenteditable]')) return;
    const item = this.item();
    const key = event.key.toLowerCase();
    if (event.ctrlKey || event.metaKey) {
      if (key === 'z' && !event.shiftKey) this.store.undo(item.id);
      else if (key === 'y' || (key === 'z' && event.shiftKey)) this.store.redo(item.id);
      else return;
      event.preventDefault();
      return;
    }
    if (event.altKey || !this.canRetouch()) return;
    const tool = this.tools.find((t) => t.key.toLowerCase() === key);
    if (tool) {
      this.tab.set('retouch');
      this.setTool(tool.id);
    } else if (key === 'escape') this.area.set(null);
    else if (key === '[') this.brush.update((b) => Math.max(4, b - 6));
    else if (key === ']') this.brush.update((b) => Math.min(200, b + 6));
  }

  // --- Saving ----------------------------------------------------------------------------------

  protected async download(): Promise<void> {
    await this.busyWhile(() => this.store.download(this.item(), this.format()));
  }

  protected async downloadAll(): Promise<void> {
    await this.busyWhile(() => this.store.downloadAll(this.format()));
  }

  protected async copy(): Promise<void> {
    try {
      await this.store.copy(this.item());
      this.copied.set('ok');
    } catch {
      this.copied.set('error');
    }
    setTimeout(() => this.copied.set(null), 2500);
  }

  private async busyWhile(work: () => Promise<void>): Promise<void> {
    this.saving.set(true);
    try {
      await work();
    } finally {
      this.saving.set(false);
    }
  }

  protected value(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected percent(value: number, of = 1): number {
    return Math.round((value / of) * 100);
  }

  protected bg(): Background {
    return this.store.background();
  }
}
