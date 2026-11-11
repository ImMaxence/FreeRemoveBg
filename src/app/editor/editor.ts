import { ChangeDetectionStrategy, Component, DestroyRef, type ElementRef, afterNextRender, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { ImagesStore, type Item } from '../core/images.store';
import { MODELS, type ModelId } from '../core/models';
import type { Sample } from '../core/samples';
import { REPO_URL } from '../core/version';
import { type Background, compose } from '../engine/compose';
import { ACCEPTED_TYPES, EXPORT_FORMATS, type ExportFormat, megapixels } from '../engine/files';
import { DownloadProgress } from '../shared/download-progress';
import { Dropzone } from '../shared/dropzone';
import { Icon } from '../shared/icon';

type Tool = 'move' | 'erase' | 'restore';
type BackgroundKind = Background['kind'];

const ZOOMS = [1, 1.5, 2, 3, 4, 6, 8];
/** Longest side of the preview's canvas: beyond it, zooming enlarges pixels instead. */
const PREVIEW_MAX_SIDE = 4096;

interface LaunchParams {
  files: { getFile(): Promise<File> }[];
}

/**
 * The tool: pictures on the left, the result in the middle (with the eraser / restore brush),
 * background and download on the right. Rendered in the browser only.
 */
@Component({
  selector: 'app-editor',
  imports: [TranslocoPipe, Icon, Dropzone, DownloadProgress],
  templateUrl: './editor.html',
  styleUrl: './editor.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.dragging]': 'dragging()',
    '(document:paste)': 'onPaste($event)',
    '(document:keydown)': 'onKey($event)',
    '(dragover)': 'onDragOver($event)',
    '(dragleave)': 'onDragLeave($event)',
    '(drop)': 'onDrop($event)',
  },
})
export class Editor {
  protected readonly store = inject(ImagesStore);
  protected readonly repoUrl = REPO_URL;
  protected readonly accept = ACCEPTED_TYPES;
  protected readonly models = MODELS;
  protected readonly formats = Object.keys(EXPORT_FORMATS) as ExportFormat[];
  protected readonly kinds: { id: BackgroundKind; icon: string }[] = [
    { id: 'transparent', icon: 'layers' },
    { id: 'color', icon: 'palette' },
    { id: 'gradient', icon: 'sparkles' },
    { id: 'image', icon: 'image' },
    { id: 'blur', icon: 'droplet' },
  ];
  protected readonly tools: { id: Tool; icon: string; key: string }[] = [
    { id: 'move', icon: 'hand', key: 'V' },
    { id: 'erase', icon: 'eraser', key: 'E' },
    { id: 'restore', icon: 'brush', key: 'R' },
  ];
  protected readonly colors = ['#ffffff', '#f1f5f9', '#0f172a', '#ef4444', '#f59e0b', '#facc15', '#22c55e', '#0ea5e9', '#6366f1', '#ec4899'];
  protected readonly gradients: [string, string][] = [
    ['#0fb98a', '#5b7cfa'],
    ['#fde68a', '#f472b6'],
    ['#a5f3fc', '#6366f1'],
    ['#fecaca', '#fb923c'],
    ['#e2e8f0', '#94a3b8'],
    ['#1e293b', '#0f172a'],
  ];

  protected readonly view = signal<'result' | 'original'>('result');
  protected readonly tool = signal<Tool>('move');
  protected readonly brush = signal(36);
  protected readonly zoom = signal(1);
  protected readonly format = signal<ExportFormat>('png');
  protected readonly dragging = signal(false);
  protected readonly saving = signal(false);
  protected readonly copied = signal<'ok' | 'error' | null>(null);
  /** Brush outline following the mouse, in pixels of the viewport's content. */
  protected readonly cursor = signal<{ x: number; y: number } | null>(null);

  protected readonly item = this.store.selected;
  protected readonly kind = computed(() => this.store.background().kind);
  protected readonly canRetouch = computed(() => this.item()?.status === 'done' && this.view() === 'result');
  protected readonly megapixels = computed(() => {
    const item = this.item();
    return item ? megapixels(item.width, item.height) : '';
  });
  /** One sentence for screen readers, announced when the state of the picture changes. */
  protected readonly statusKey = computed(() => {
    const item = this.item();
    if (!item) return 'editor.status.empty';
    if (item.status === 'done') return 'editor.status.done';
    if (item.status === 'error') return 'editor.status.error';
    const stage = this.store.progress()?.stage;
    return stage === 'download' ? 'editor.status.download' : stage === 'load' ? 'editor.status.load' : 'editor.status.run';
  });

  private readonly viewport = viewChild<ElementRef<HTMLElement>>('viewport');
  private readonly canvas = viewChild<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly box = signal({ width: 0, height: 0 });
  private readonly scratch = document.createElement('canvas');
  private stroke: { id: number; x: number; y: number } | null = null;
  private frame = 0;
  /** Last colors chosen, restored when coming back to a kind of background. */
  private lastColor = '#ffffff';
  private lastGradient: [string, string] = this.gradients[0];
  private lastImage: Extract<Background, { kind: 'image' }> | null = null;
  private lastBlur = 40;

  /** Size of the picture on screen, in CSS pixels: fitted to the viewport, times the zoom. */
  protected readonly display = computed(() => {
    const item = this.item();
    const { width, height } = this.box();
    if (!item || !width || !height) return { width: 0, height: 0 };
    const fit = Math.min(width / item.width, height / item.height, 1);
    return { width: Math.max(1, Math.round(item.width * fit * this.zoom())), height: Math.max(1, Math.round(item.height * fit * this.zoom())) };
  });

  constructor() {
    // ?device=wasm and ?model=… impose the processor or a model (tests, broken graphics drivers).
    const params = inject(ActivatedRoute).snapshot.queryParamMap;
    const model = params.get('model');
    if (params.get('device') === 'wasm' || model) {
      this.store.configure({ device: params.get('device') === 'wasm' ? 'wasm' : undefined, model: model && model in MODELS ? (model as ModelId) : undefined });
    }

    // The viewport's size, followed so the picture always fits.
    const observer = new ResizeObserver(([entry]) => this.box.set({ width: Math.floor(entry.contentRect.width), height: Math.floor(entry.contentRect.height) }));
    effect((onCleanup) => {
      const element = this.viewport()?.nativeElement;
      if (!element) return;
      observer.observe(element);
      onCleanup(() => observer.unobserve(element));
    });
    inject(DestroyRef).onDestroy(() => {
      observer.disconnect();
      cancelAnimationFrame(this.frame);
    });

    // Redraws whenever the picture, its mask, the background, the view or the size change.
    effect(() => {
      const item = this.item();
      const canvas = this.canvas()?.nativeElement;
      const display = this.display();
      const background = this.store.background();
      const original = this.view() === 'original';
      if (!item || !canvas || !display.width) return;
      untracked(() => this.draw(canvas, item, display, background, original));
    });

    // A new picture starts fitted, on the result.
    effect(() => {
      this.store.selectedId();
      untracked(() => {
        this.zoom.set(1);
        this.view.set('result');
      });
    });

    // "Open with FreeRemoveBg" (installed app) hands its files over here.
    afterNextRender(() => {
      const queue = (window as unknown as { launchQueue?: { setConsumer(consumer: (params: LaunchParams) => void): void } }).launchQueue;
      queue?.setConsumer(async (params) => {
        if (params.files.length) void this.store.add(await Promise.all(params.files.map((f) => f.getFile())));
      });
    });
  }

  private draw(canvas: HTMLCanvasElement, item: Item, display: { width: number; height: number }, background: Background, original: boolean): void {
    const ratio = Math.min(devicePixelRatio || 1, item.width / display.width, PREVIEW_MAX_SIDE / Math.max(display.width, display.height));
    const width = Math.max(1, Math.round(display.width * ratio));
    const height = Math.max(1, Math.round(display.height * ratio));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    compose(canvas, this.scratch, item.source, original ? null : item.mask, background);
  }

  private redrawSoon(): void {
    cancelAnimationFrame(this.frame);
    this.frame = requestAnimationFrame(() => {
      const item = this.item();
      const canvas = this.canvas()?.nativeElement;
      if (item && canvas) this.draw(canvas, item, this.display(), this.store.background(), false);
    });
  }

  // --- Pictures in -------------------------------------------------------------------------

  protected add(files: File[]): void {
    void this.store.add(files);
  }

  protected addSample(sample: Sample): void {
    void this.store.addFromUrl(sample.url, sample.name);
  }

  protected onPick(picker: HTMLInputElement): void {
    const files = Array.from(picker.files ?? []);
    picker.value = '';
    if (files.length) this.add(files);
  }

  protected onPaste(event: ClipboardEvent): void {
    const files = Array.from(event.clipboardData?.files ?? []);
    if (!files.length) return;
    event.preventDefault();
    this.add(files);
  }

  protected onDragOver(event: DragEvent): void {
    if (!event.dataTransfer?.types.includes('Files')) return;
    event.preventDefault();
    this.dragging.set(true);
  }

  protected onDragLeave(event: DragEvent): void {
    if (!(event.currentTarget as HTMLElement).contains(event.relatedTarget as Node | null)) this.dragging.set(false);
  }

  protected onDrop(event: DragEvent): void {
    if (event.defaultPrevented) return;
    event.preventDefault();
    this.dragging.set(false);
    const files = Array.from(event.dataTransfer?.files ?? []);
    if (files.length) this.add(files);
  }

  // --- Background --------------------------------------------------------------------------

  protected setKind(kind: BackgroundKind): void {
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

  /** Whether the panel of a kind is open: "image" stays open while no picture is chosen. */
  protected readonly panel = signal<BackgroundKind>('transparent');

  protected openKind(kind: BackgroundKind): void {
    this.panel.set(kind);
    this.setKind(kind);
  }

  // --- Retouching --------------------------------------------------------------------------

  protected setTool(tool: Tool): void {
    this.tool.set(tool);
    if (tool !== 'move') this.view.set('result');
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

  private maskPoint(event: PointerEvent, item: Item): { x: number; y: number; scale: number } {
    const rect = this.canvas()!.nativeElement.getBoundingClientRect();
    const scale = item.mask!.width / rect.width;
    return { x: (event.clientX - rect.left) * scale, y: (event.clientY - rect.top) * scale, scale };
  }

  protected onPointerDown(event: PointerEvent): void {
    const item = this.item();
    if (this.tool() === 'move' || !this.canRetouch() || !item?.mask || event.button !== 0) return;
    event.preventDefault();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    this.store.beginStroke(item.id);
    const point = this.maskPoint(event, item);
    this.stroke = { id: item.id, x: point.x, y: point.y };
    this.paint(item, point.x, point.y, point.x, point.y, point.scale);
  }

  protected onPointerMove(event: PointerEvent): void {
    const canvas = this.canvas()?.nativeElement;
    if (canvas && this.tool() !== 'move' && event.pointerType === 'mouse') {
      const rect = canvas.getBoundingClientRect();
      this.cursor.set({ x: event.clientX - rect.left, y: event.clientY - rect.top });
    }
    const item = this.item();
    if (!this.stroke || !item?.mask || item.id !== this.stroke.id) return;
    // Every position the pointer went through, not only the last of the frame: smoother lines.
    for (const e of event.getCoalescedEvents?.() ?? [event]) {
      const point = this.maskPoint(e, item);
      this.paint(item, this.stroke.x, this.stroke.y, point.x, point.y, point.scale);
      this.stroke.x = point.x;
      this.stroke.y = point.y;
    }
  }

  protected onPointerUp(): void {
    if (!this.stroke) return;
    this.store.touch(this.stroke.id, true);
    this.stroke = null;
  }

  private paint(item: Item, x0: number, y0: number, x1: number, y1: number, scale: number): void {
    const ctx = item.mask!.getContext('2d')!;
    const erase = this.tool() === 'erase';
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

  protected onKey(event: KeyboardEvent): void {
    const target = event.target as HTMLElement | null;
    if (target?.closest('input, textarea, select, [contenteditable]')) return;
    const item = this.item();
    const key = event.key.toLowerCase();
    if ((event.ctrlKey || event.metaKey) && item) {
      if (key === 'z' && !event.shiftKey) this.store.undo(item.id);
      else if (key === 'y' || (key === 'z' && event.shiftKey)) this.store.redo(item.id);
      else return;
      event.preventDefault();
      return;
    }
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (key === 'v') this.setTool('move');
    else if (key === 'e' && this.canRetouch()) this.setTool('erase');
    else if (key === 'r' && this.canRetouch()) this.setTool('restore');
    else if (key === '[') this.brush.update((b) => Math.max(4, b - 6));
    else if (key === ']') this.brush.update((b) => Math.min(200, b + 6));
  }

  // --- Saving ------------------------------------------------------------------------------

  protected async download(item: Item): Promise<void> {
    await this.busyWhile(() => this.store.download(item, this.format()));
  }

  protected async downloadAll(): Promise<void> {
    await this.busyWhile(() => this.store.downloadAll(this.format()));
  }

  protected async copy(item: Item): Promise<void> {
    try {
      await this.store.copy(item);
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

  protected percent(progress: number): number {
    return Math.round(progress * 100);
  }
}
