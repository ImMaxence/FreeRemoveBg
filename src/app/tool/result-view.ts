import { ChangeDetectionStrategy, Component, DestroyRef, type ElementRef, Injector, afterNextRender, computed, effect, inject, input, signal, untracked, viewChild } from '@angular/core';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { ImagesStore, type Item } from '../core/images.store';
import { MODELS, MODEL_IDS, type ModelId, SAM } from '../core/models';
import { SamService } from '../core/sam.service';
import { formatBytes } from '../engine/download-stats';
import type { SamPoint } from '../engine/sam';
import { LASSO_FREEHAND_GAP, LASSO_MIN_POINTS, type LassoPoint, clampPoint, closesShape, isNewPoint, isShape, shapePath, simplify } from '../engine/lasso';
import { REPO_URL } from '../core/version';
import { type Background, compose } from '../engine/compose';
import { ACCEPTED_TYPES, EXPORT_FORMATS, type ExportFormat } from '../engine/files';
import { type Rect, areaBetween } from '../engine/prepare';
import { DownloadProgress } from '../shared/download-progress';
import { Icon } from '../shared/icon';
import { canvasPixels, elementSize, fitSize } from './fit';

type Tool = 'move' | 'erase' | 'restore' | 'lasso' | 'rescue' | 'point';
type Tab = 'background' | 'retouch';
type BackgroundKind = Background['kind'];

const MIN_ZOOM = 1;
const MAX_ZOOM = 8;
/** Zoom of one click on a zoom button. */
const ZOOM_STEP = 1.5;

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
  protected readonly sam = inject(SamService);
  protected readonly samModel = SAM;
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
  protected readonly tools: { id: Tool; icon: string; key: string; isNew?: boolean }[] = [
    { id: 'move', icon: 'hand', key: 'V' },
    { id: 'erase', icon: 'eraser', key: 'E' },
    { id: 'restore', icon: 'brush', key: 'R' },
    { id: 'lasso', icon: 'lasso', key: 'L', isNew: true },
    { id: 'rescue', icon: 'select', key: 'Z' },
    { id: 'point', icon: 'pointer', key: 'C' },
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
  /** The lasso is in hand. */
  protected readonly lassoing = computed(() => this.tool() === 'lasso' && this.canRetouch());
  /** The shape drawn with the lasso, in pixels of the picture. */
  protected readonly lassoPoints = signal<LassoPoint[]>([]);
  protected readonly lassoClosed = signal(false);
  /** Where the pointer is: a line follows it from the last point. */
  protected readonly lassoHover = signal<LassoPoint | null>(null);
  /** Restore or cut around the shape rather than inside it. */
  protected readonly lassoAround = signal(false);
  /** The shape can be applied (closing it if needed). */
  protected readonly lassoUsable = computed(() => isShape(this.lassoPoints()));
  /** A click on the first point closes the shape. */
  protected readonly lassoCanClose = computed(() => !this.lassoClosed() && this.lassoPoints().length >= LASSO_MIN_POINTS);
  protected readonly lassoLine = computed(() => shapePath(this.lassoPoints(), this.lassoClosed()));
  /** What will change: the shape, or the whole picture minus the shape. */
  protected readonly lassoFill = computed(() => shapePath(this.lassoPoints(), true, this.lassoAround() ? this.item() : undefined));
  /** A freehand line has many points: only its ends get a dot. */
  protected readonly lassoDots = computed(() => {
    const points = this.lassoPoints();
    return points.length <= 40 ? points : [points[0], points[points.length - 1]];
  });
  private lassoDrag: { clientX: number; clientY: number; moved: boolean; fresh: boolean; from: number } | null = null;
  /** The "Click" tool is in hand. */
  protected readonly pointing = computed(() => this.tool() === 'point' && this.canRetouch());
  /** SAM has read this picture: clicks are answered at once. */
  /** The picture as SAM knows it: its id and its current bitmap (a crop or a turn makes another). */
  private readonly samKey = computed(() => this.sam.keyOf(this.item()));
  protected readonly samReady = computed(() => this.sam.state() === 'ready' && this.sam.readKey() === this.samKey());
  /** The points clicked, in pixels of the copy SAM read. */
  protected readonly samPoints = signal<SamPoint[]>([]);
  /** The object SAM found under them. */
  protected readonly samSelection = signal<{ alpha: Uint8ClampedArray<ArrayBuffer>; width: number; height: number } | null>(null);
  protected readonly samMode = signal<'include' | 'exclude'>('include');
  /** A box drawn around the object, in pixels of the copy SAM read: SAM does best with one. */
  protected readonly samBox = signal<Rect | null>(null);
  /** The box being drawn, before it is handed to SAM. */
  protected readonly samDraft = signal<Rect | null>(null);
  private samDrag: { x: number; y: number; clientX: number; clientY: number; moved: boolean } | null = null;
  protected readonly samBusy = signal(false);
  protected readonly samFailed = signal(false);
  protected readonly samWork = computed(() => this.sam.workSize(this.item()));
  protected readonly samPercent = computed(() => Math.round((this.sam.download()?.progress ?? 0) * 100));
  protected readonly otherDrafts = computed(() => this.store.drafts().filter((d) => d.id !== this.item().id));
  /** The models this picture was not cut out with, to compare. */
  protected readonly otherModels = computed<ModelId[]>(() => MODEL_IDS.filter((id) => id !== this.item().model));
  protected readonly maxZoom = MAX_ZOOM;
  /** Dragging the picture around with the "Move" tool. */
  protected readonly panning = signal(false);
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
  private readonly overlay = viewChild<ElementRef<HTMLCanvasElement>>('overlay');
  private readonly box = elementSize(this.viewport);
  protected readonly display = computed(() => fitSize(this.item().width, this.item().height, this.box(), this.zoom()));
  private readonly scratch = document.createElement('canvas');
  private readonly injector = inject(Injector);
  /** The picture shown, by identity: the item itself changes with every stroke and thumbnail. */
  private readonly itemId = computed(() => this.item().id);
  private pan: { x: number; y: number; left: number; top: number } | null = null;
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
      this.itemId();
      untracked(() => {
        this.zoom.set(1);
        this.view.set('result');
        this.area.set(null);
        this.lassoClear();
      });
    });
    // The "Click" tool: SAM is looked for when it is opened, and reads each picture once.
    effect(() => {
      this.samKey();
      if (this.tool() !== 'point' || !this.done()) return;
      const state = this.sam.state();
      untracked(() => {
        if (state === 'idle') void this.sam.check();
        if (state === 'ready') void this.sam.read(this.item()).catch((e) => {
          console.error(e);
          this.samFailed.set(true);
        });
      });
    });
    // A new picture, or a new version of it: the points belong to the old one.
    effect(() => {
      this.samKey();
      untracked(() => this.samClear());
    });
    // The selection, tinted yellow over the picture.
    effect(() => {
      const selection = this.samSelection();
      const overlay = this.overlay()?.nativeElement;
      const canvas = this.canvas()?.nativeElement;
      this.display();
      if (!overlay || !canvas) return;
      untracked(() => {
        overlay.width = canvas.width;
        overlay.height = canvas.height;
        const ctx = overlay.getContext('2d')!;
        ctx.clearRect(0, 0, overlay.width, overlay.height);
        if (!selection) return;
        const tint = new ImageData(selection.width, selection.height);
        for (let i = 0; i < selection.alpha.length; i++) {
          tint.data[i * 4] = 255;
          tint.data[i * 4 + 1] = 214;
          tint.data[i * 4 + 2] = 10;
          tint.data[i * 4 + 3] = selection.alpha[i] * 0.55;
        }
        const small = new OffscreenCanvas(selection.width, selection.height);
        small.getContext('2d')!.putImageData(tint, 0, 0);
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(small, 0, 0, overlay.width, overlay.height);
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
    if (tool !== 'point') this.samClear();
    if (tool !== 'lasso') this.lassoClear();
  }

  // --- Lasso -------------------------------------------------------------------------------

  /** Where the pointer is, in pixels of the picture, kept within it. */
  private picturePoint(event: PointerEvent): LassoPoint {
    const item = this.item();
    const at = this.fraction(event);
    return clampPoint({ x: at.x * item.width, y: at.y * item.height }, item.width, item.height);
  }

  /** Pixels of the screen per pixel of the picture, at the current zoom. */
  private screenScale(): number {
    return this.canvas()!.nativeElement.getBoundingClientRect().width / this.item().width;
  }

  /** A press: a point of the shape, the start of a freehand line, or the first point again (closing it). */
  private lassoStart(event: PointerEvent): void {
    if (this.lassoClosed()) this.lassoClear();
    const at = this.picturePoint(event);
    const scale = this.screenScale();
    const points = this.lassoPoints();
    if (closesShape(points, at, scale)) {
      this.lassoClose();
      return;
    }
    if (isNewPoint(points, at, scale)) this.lassoPoints.set([...points, at]);
    this.lassoDrag = { clientX: event.clientX, clientY: event.clientY, moved: false, fresh: !points.length, from: this.lassoPoints().length - 1 };
  }

  private lassoMove(event: PointerEvent): void {
    this.lassoHover.set(this.lassoClosed() ? null : this.picturePoint(event));
    const drag = this.lassoDrag;
    if (!drag) return;
    if (!drag.moved && Math.hypot(event.clientX - drag.clientX, event.clientY - drag.clientY) < LASSO_FREEHAND_GAP) return;
    drag.moved = true;
    const scale = this.screenScale();
    const points = [...this.lassoPoints()];
    for (const e of event.getCoalescedEvents?.() ?? [event]) {
      const at = this.picturePoint(e);
      if (isNewPoint(points, at, scale, LASSO_FREEHAND_GAP)) points.push(at);
    }
    this.lassoPoints.set(points);
  }

  /** The press ends. A freehand line is lightened; drawn on its own, it closes like a lasso. */
  private lassoEnd(): void {
    const drag = this.lassoDrag;
    this.lassoDrag = null;
    if (!drag?.moved) return;
    const points = this.lassoPoints();
    const start = Math.max(0, drag.from);
    this.lassoPoints.set([...points.slice(0, start), ...simplify(points.slice(start), 0.8 / this.screenScale())]);
    if (drag.fresh && isShape(this.lassoPoints())) this.lassoClose();
  }

  protected lassoClose(): void {
    if (this.lassoPoints().length < LASSO_MIN_POINTS) return;
    this.lassoClosed.set(true);
    this.lassoHover.set(null);
  }

  /** Restores ("add") or cuts ("remove") the shape, or around it: one step, undone with Ctrl + Z. */
  protected lassoApply(mode: 'add' | 'remove'): void {
    if (!this.lassoUsable()) return;
    this.store.applyShape(this.item().id, this.lassoPoints(), mode, this.lassoAround());
    this.lassoClear();
  }

  protected lassoClear(): void {
    this.lassoPoints.set([]);
    this.lassoClosed.set(false);
    this.lassoHover.set(null);
    this.lassoDrag = null;
  }

  /** Ctrl + Z while a shape is drawn: it is reopened, then loses its points one by one. */
  private lassoStepBack(): boolean {
    if (!this.lassoing() || !this.lassoPoints().length || this.lassoDrag) return false;
    if (this.lassoClosed()) this.lassoClosed.set(false);
    else this.lassoPoints.update((points) => points.slice(0, -1));
    return true;
  }

  // --- "Click" tool (SAM) ------------------------------------------------------------------

  protected samSize(): string {
    return formatBytes(this.sam.bytes(), this.transloco.getActiveLang());
  }

  /** With the "Click" tool, a press starts either a click (a point) or a box (a drag). */
  private samStart(event: PointerEvent): void {
    if (!this.samReady() || this.samBusy()) return;
    const at = this.fraction(event);
    this.samDrag = { x: at.x, y: at.y, clientX: event.clientX, clientY: event.clientY, moved: false };
  }

  private samMove(event: PointerEvent): void {
    const drag = this.samDrag;
    if (!drag) return;
    if (!drag.moved && Math.hypot(event.clientX - drag.clientX, event.clientY - drag.clientY) < 6) return;
    drag.moved = true;
    const at = this.fraction(event);
    const work = this.samWork();
    this.samDraft.set(areaBetween(drag.x, drag.y, at.x, at.y, work.width, work.height));
  }

  /** The press ends: a box is handed to SAM, or the click becomes a point. */
  private async samEnd(event: PointerEvent): Promise<void> {
    const drag = this.samDrag;
    this.samDrag = null;
    if (!drag) return;
    const work = this.samWork();
    if (drag.moved) {
      const box = this.samDraft();
      this.samDraft.set(null);
      if (!box) return;
      this.samBox.set(box);
    } else {
      if (drag.x < 0 || drag.y < 0 || drag.x > 1 || drag.y > 1) return;
      const positive = this.samMode() === 'include' && !event.altKey;
      this.samPoints.set([...this.samPoints(), { x: drag.x * work.width, y: drag.y * work.height, positive }]);
    }
    this.samBusy.set(true);
    this.samFailed.set(false);
    try {
      this.samSelection.set(await this.sam.segment(this.samPoints(), this.samBox() ?? undefined));
    } catch (e) {
      console.error(e);
      this.samFailed.set(true);
    } finally {
      this.samBusy.set(false);
    }
  }

  protected samApply(mode: 'add' | 'remove'): void {
    const selection = this.samSelection();
    if (!selection) return;
    this.store.applySelection(this.item().id, selection.alpha, selection.width, selection.height, mode);
    this.samClear();
  }

  protected samClear(): void {
    this.samPoints.set([]);
    this.samSelection.set(null);
    this.samBox.set(null);
    this.samDraft.set(null);
    this.samDrag = null;
  }

  protected zoomBy(step: 1 | -1): void {
    this.zoomAt(step > 0 ? this.zoom() * ZOOM_STEP : this.zoom() / ZOOM_STEP);
  }

  protected zoomFit(): void {
    this.zoomAt(MIN_ZOOM);
  }

  /** The mouse wheel (and a trackpad pinch) zooms, around the pointer. */
  protected onWheel(event: WheelEvent): void {
    event.preventDefault();
    const pixels = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY;
    this.zoomAt(this.zoom() * Math.exp(-pixels * 0.0015), event.clientX, event.clientY);
  }

  /**
   * Zooms so that the point of the picture under (x, y), the middle of the view by default,
   * stays under it: the picture grows around what the user looks at.
   */
  private zoomAt(next: number, x?: number, y?: number): void {
    const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(next * 100) / 100));
    const viewport = this.viewport()?.nativeElement;
    const canvas = this.canvas()?.nativeElement;
    if (!viewport || !canvas || zoom === this.zoom()) {
      this.zoom.set(zoom);
      return;
    }
    const view = viewport.getBoundingClientRect();
    const before = canvas.getBoundingClientRect();
    const px = x ?? view.left + view.width / 2;
    const py = y ?? view.top + view.height / 2;
    const fx = Math.min(1, Math.max(0, (px - before.left) / before.width));
    const fy = Math.min(1, Math.max(0, (py - before.top) / before.height));
    this.zoom.set(zoom);
    afterNextRender(
      () => {
        const after = canvas.getBoundingClientRect();
        viewport.scrollLeft += after.left + fx * after.width - px;
        viewport.scrollTop += after.top + fy * after.height - py;
      },
      { injector: this.injector },
    );
  }

  /** With the "Move" tool, dragging moves the zoomed picture. */
  protected onPanStart(event: PointerEvent): void {
    const viewport = this.viewport()?.nativeElement;
    if (this.tool() !== 'move' || event.button !== 0 || !viewport) return;
    if (viewport.scrollWidth <= viewport.clientWidth && viewport.scrollHeight <= viewport.clientHeight) return;
    event.preventDefault();
    viewport.setPointerCapture(event.pointerId);
    this.pan = { x: event.clientX, y: event.clientY, left: viewport.scrollLeft, top: viewport.scrollTop };
    this.panning.set(true);
  }

  protected onPanMove(event: PointerEvent): void {
    const viewport = this.viewport()?.nativeElement;
    if (!this.pan || !viewport) return;
    viewport.scrollLeft = this.pan.left - (event.clientX - this.pan.x);
    viewport.scrollTop = this.pan.top - (event.clientY - this.pan.y);
  }

  protected onPanEnd(): void {
    this.pan = null;
    this.panning.set(false);
  }

  /** Cuts the picture out again with another model, to compare. */
  protected compareWith(model: ModelId): void {
    const item = this.item();
    if (item.undo.length && !confirm(this.transloco.translate('tool.result.compareConfirm'))) return;
    this.store.redoWith(item.id, model);
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
    if (this.pointing()) {
      event.preventDefault();
      (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
      this.samStart(event);
      return;
    }
    if (this.lassoing()) {
      event.preventDefault();
      (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
      this.lassoStart(event);
      return;
    }
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
    if (this.samDrag) {
      this.samMove(event);
      return;
    }
    if (this.lassoing()) {
      this.lassoMove(event);
      return;
    }
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

  protected onPointerUp(event?: PointerEvent): void {
    if (this.samDrag && event) {
      void this.samEnd(event);
      return;
    }
    if (this.lassoDrag) {
      this.lassoEnd();
      return;
    }
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
      if (key === 'z' && !event.shiftKey) {
        if (!this.lassoStepBack()) this.store.undo(item.id);
      }
      else if (key === 'y' || (key === 'z' && event.shiftKey)) this.store.redo(item.id);
      else return;
      event.preventDefault();
      return;
    }
    if (event.altKey || !this.canRetouch()) return;
    if (this.lassoing() && this.lassoPoints().length) {
      if (key === 'escape') return this.lassoClear();
      if (key === 'backspace' || key === 'delete') {
        event.preventDefault();
        this.lassoStepBack();
        return;
      }
      // Enter on a focused button presses the button.
      if (key === 'enter' && !target?.closest('button, a')) {
        event.preventDefault();
        return this.lassoClose();
      }
    }
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
