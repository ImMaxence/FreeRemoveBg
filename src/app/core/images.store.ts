import { Injectable, computed, signal } from '@angular/core';
import * as Comlink from 'comlink';
import { type Background, alphaToImageData, compose } from '../engine/compose';
import { EXPORT_FORMATS, type ExportFormat, exportName, isImageFile } from '../engine/files';
import { maskSize, workingSize } from '../engine/mask';
import { uniqueNames, zip } from '../engine/zip';
import type { ModelId } from './models';
import type { AiDevice, RemoveProgress, RemoveResult, RemoveWorkerApi, WorkerOptions } from '../workers/worker-types';

export type ItemStatus = 'queued' | 'working' | 'done' | 'error';

export interface Item {
  id: number;
  name: string;
  /** The picture as worked on and saved: full size, shrunk only above the pixel limit. */
  source: ImageBitmap;
  width: number;
  height: number;
  /** The original was larger than the limit and has been shrunk. */
  resized: boolean;
  status: ItemStatus;
  /** What the AI found, kept to undo every retouch at once. */
  aiMask: ImageData | null;
  /** White where the subject is: what the brush edits. Changed in place, see `revision`. */
  mask: HTMLCanvasElement | null;
  /** Changes whenever the mask does, so views redraw. */
  revision: number;
  undo: ImageData[];
  redo: ImageData[];
  /** Small preview of the result (object URL). */
  thumb: string | null;
  error: string | null;
}

/** Pictures above this are shrunk: canvases have limits, tighter on iPhone and iPad. */
const MAX_PIXELS = typeof navigator !== 'undefined' && /iPhone|iPad|iPod/.test(navigator.userAgent) ? 16e6 : 25e6;
const UNDO_STEPS = 12;
const THUMB_SIDE = 192;

/**
 * The pictures of the session, their masks and the chosen background. Everything stays in the
 * page's memory: nothing is stored, nothing is sent. The AI runs in a worker created on first
 * use, so the public pages never pay for it.
 */
@Injectable({ providedIn: 'root' })
export class ImagesStore {
  readonly items = signal<Item[]>([]);
  readonly selectedId = signal<number | null>(null);
  readonly selected = computed(() => this.items().find((i) => i.id === this.selectedId()) ?? null);
  /** Shared by every picture, so a batch gets the same look. */
  readonly background = signal<Background>({ kind: 'transparent' });
  /** What the AI is doing for the picture being worked on. */
  readonly progress = signal<RemoveProgress | null>(null);
  /** Model and device of the last result. */
  readonly engine = signal<{ model: ModelId; device: AiDevice; ms: number } | null>(null);
  /** Files that could not be read (wrong format), to tell the user. */
  readonly rejected = signal<string[]>([]);
  readonly doneCount = computed(() => this.items().filter((i) => i.status === 'done').length);
  readonly busy = computed(() => this.items().some((i) => i.status === 'queued' || i.status === 'working'));

  private nextId = 1;
  private running = false;
  private worker?: Worker;
  private remote?: Comlink.Remote<RemoveWorkerApi>;
  private options: WorkerOptions = {};
  private scratch?: HTMLCanvasElement;

  private get ai(): Comlink.Remote<RemoveWorkerApi> {
    if (!this.remote) {
      this.worker = new Worker(new URL('../workers/remove.worker', import.meta.url), { type: 'module', name: 'frb-ai' });
      this.remote = Comlink.wrap<RemoveWorkerApi>(this.worker);
      void this.remote.configure(this.options);
    }
    return this.remote;
  }

  /** Imposes the device or the model (tests, broken graphics drivers), from the next picture on. */
  configure(options: WorkerOptions): void {
    this.options = options;
    this.worker?.terminate();
    this.worker = this.remote = undefined;
  }

  /** Adds pictures and starts cutting them out, one after the other. */
  async add(files: Iterable<File>): Promise<void> {
    const rejected: string[] = [];
    for (const file of files) {
      if (!isImageFile(file)) {
        rejected.push(file.name);
        continue;
      }
      try {
        const { bitmap, resized } = await decode(file);
        const item: Item = {
          id: this.nextId++,
          name: file.name || 'image.png',
          source: bitmap,
          width: bitmap.width,
          height: bitmap.height,
          resized,
          status: 'queued',
          aiMask: null,
          mask: null,
          revision: 0,
          undo: [],
          redo: [],
          thumb: null,
          error: null,
        };
        this.items.update((items) => [...items, item]);
        if (this.selectedId() === null) this.selectedId.set(item.id);
      } catch {
        rejected.push(file.name);
      }
    }
    this.rejected.set(rejected);
    void this.run();
  }

  /** Loads a picture served by the site (the samples) as if it had been dropped. */
  async addFromUrl(url: string, name: string): Promise<void> {
    const blob = await (await fetch(url)).blob();
    await this.add([new File([blob], name, { type: blob.type })]);
  }

  remove(id: number): void {
    const item = this.find(id);
    if (!item) return;
    const index = this.items().indexOf(item);
    this.items.update((items) => items.filter((i) => i.id !== id));
    // A picture being worked on is still read by the worker: it is released with the page.
    if (item.status !== 'working') item.source.close();
    if (item.thumb) URL.revokeObjectURL(item.thumb);
    if (this.selectedId() === id) {
      const rest = this.items();
      this.selectedId.set(rest[Math.min(index, rest.length - 1)]?.id ?? null);
    }
  }

  clear(): void {
    for (const item of [...this.items()]) this.remove(item.id);
    this.rejected.set([]);
  }

  retry(id: number): void {
    this.patch(id, { status: 'queued', error: null });
    void this.run();
  }

  // --- Retouching -------------------------------------------------------------------------

  /** Before a brush stroke: remembers the mask so the stroke can be undone. */
  beginStroke(id: number): void {
    const item = this.find(id);
    if (!item?.mask) return;
    const snapshot = snapshotOf(item.mask);
    this.patch(id, { undo: [...item.undo.slice(-(UNDO_STEPS - 1)), snapshot], redo: [] });
  }

  /** The mask changed (brush moved, undo…): views redraw. `final` also refreshes the thumbnail. */
  touch(id: number, final = false): void {
    const item = this.find(id);
    if (!item) return;
    this.patch(id, { revision: item.revision + 1 });
    if (final) void this.refreshThumb(id);
  }

  undo(id: number): void {
    const item = this.find(id);
    if (!item?.mask || !item.undo.length) return;
    const previous = item.undo[item.undo.length - 1];
    const now = snapshotOf(item.mask);
    item.mask.getContext('2d')!.putImageData(previous, 0, 0);
    this.patch(id, { undo: item.undo.slice(0, -1), redo: [...item.redo, now] });
    this.touch(id, true);
  }

  redo(id: number): void {
    const item = this.find(id);
    if (!item?.mask || !item.redo.length) return;
    const next = item.redo[item.redo.length - 1];
    const now = snapshotOf(item.mask);
    item.mask.getContext('2d')!.putImageData(next, 0, 0);
    this.patch(id, { redo: item.redo.slice(0, -1), undo: [...item.undo, now] });
    this.touch(id, true);
  }

  /** Back to what the AI found, undoing every retouch (itself undoable). */
  resetMask(id: number): void {
    const item = this.find(id);
    if (!item?.mask || !item.aiMask) return;
    this.beginStroke(id);
    drawAiMask(item.mask, item.aiMask);
    this.touch(id, true);
  }

  // --- Saving -----------------------------------------------------------------------------

  /** The finished picture at full size. Formats without transparency get a white background. */
  async render(item: Item, format: ExportFormat, quality = 0.92): Promise<Blob> {
    const canvas = document.createElement('canvas');
    canvas.width = item.width;
    canvas.height = item.height;
    const { mime, transparency } = EXPORT_FORMATS[format];
    const background = this.background();
    compose(canvas, document.createElement('canvas'), item.source, item.mask, !transparency && background.kind === 'transparent' ? { kind: 'color', color: '#ffffff' } : background);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, mime, quality));
    // Releases the pixels now rather than at the next garbage collection.
    canvas.width = canvas.height = 0;
    if (!blob) throw new Error('The picture could not be encoded');
    return blob;
  }

  async download(item: Item, format: ExportFormat): Promise<void> {
    save(await this.render(item, format), exportName(item.name, format));
  }

  /** Every finished picture in one ZIP archive. */
  async downloadAll(format: ExportFormat): Promise<void> {
    const done = this.items().filter((i) => i.status === 'done');
    const names = uniqueNames(done.map((i) => exportName(i.name, format)));
    const files: { name: string; data: Uint8Array }[] = [];
    for (const [index, item] of done.entries()) {
      files.push({ name: names[index], data: new Uint8Array(await (await this.render(item, format)).arrayBuffer()) });
    }
    save(zip(files), 'freeremovebg.zip');
  }

  /** Copies the finished picture (PNG) so it can be pasted elsewhere. */
  async copy(item: Item): Promise<void> {
    // The promise form keeps the user's gesture alive in Safari while the picture is encoded.
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': this.render(item, 'png') })]);
  }

  // --- AI ---------------------------------------------------------------------------------

  private async run(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      for (let item = this.nextQueued(); item; item = this.nextQueued()) {
        const id = item.id;
        this.patch(id, { status: 'working' });
        try {
          const result = await this.cutOut(item);
          this.engine.set({ model: result.model, device: result.device, ms: result.ms });
          if (!this.find(id)) {
            // Removed while the AI was working.
            item.source.close();
            continue;
          }
          const aiMask = alphaToImageData(result.alpha, result.size);
          const mask = document.createElement('canvas');
          Object.assign(mask, maskSize(item.width, item.height));
          drawAiMask(mask, aiMask);
          this.patch(id, { status: 'done', aiMask, mask, undo: [], redo: [] });
          this.touch(id, true);
        } catch (e) {
          console.error(e);
          this.patch(id, { status: 'error', error: e instanceof Error ? e.message : String(e) });
        } finally {
          this.progress.set(null);
        }
      }
    } finally {
      this.running = false;
    }
  }

  /**
   * Asks the worker for the subject of a picture. A failure on the graphics card (driver,
   * memory, unsupported operation) leaves ONNX Runtime unusable: the worker is replaced by a
   * new one kept on the processor, and the picture is tried again there.
   */
  private async cutOut(item: Item): Promise<RemoveResult> {
    const attempt = async () => {
      const { size } = await this.ai.target();
      const input = await createImageBitmap(item.source, { resizeWidth: size, resizeHeight: size, resizeQuality: 'high' });
      return this.ai.remove(
        Comlink.transfer(input, [input]),
        Comlink.proxy((p: RemoveProgress) => this.progress.set(p)),
      );
    };
    try {
      return await attempt();
    } catch (e) {
      const failed = await this.ai.target().catch(() => null);
      if (failed?.device !== 'webgpu') throw e;
      console.warn('Background removal failed on WebGPU, switching to WebAssembly', e);
      this.configure({ ...this.options, device: 'wasm', model: undefined });
      return attempt();
    }
  }

  private nextQueued(): Item | undefined {
    // The picture on screen first, then the others in order.
    const queued = this.items().filter((i) => i.status === 'queued');
    return queued.find((i) => i.id === this.selectedId()) ?? queued[0];
  }

  private async refreshThumb(id: number): Promise<void> {
    const item = this.find(id);
    if (!item?.mask) return;
    const revision = item.revision;
    const scale = Math.min(1, THUMB_SIDE / Math.max(item.width, item.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(item.width * scale));
    canvas.height = Math.max(1, Math.round(item.height * scale));
    this.scratch ??= document.createElement('canvas');
    compose(canvas, this.scratch, item.source, item.mask, { kind: 'transparent' });
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    const current = this.find(id);
    if (!blob || !current || current.revision !== revision) return;
    if (current.thumb) URL.revokeObjectURL(current.thumb);
    this.patch(id, { thumb: URL.createObjectURL(blob) });
  }

  private find(id: number): Item | undefined {
    return this.items().find((i) => i.id === id);
  }

  private patch(id: number, changes: Partial<Item>): void {
    this.items.update((items) => items.map((i) => (i.id === id ? { ...i, ...changes } : i)));
  }
}

async function decode(file: File): Promise<{ bitmap: ImageBitmap; resized: boolean }> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const size = workingSize(bitmap.width, bitmap.height, MAX_PIXELS);
  if (size.width === bitmap.width && size.height === bitmap.height) return { bitmap, resized: false };
  const small = await createImageBitmap(bitmap, { resizeWidth: size.width, resizeHeight: size.height, resizeQuality: 'high' });
  bitmap.close();
  return { bitmap: small, resized: true };
}

function snapshotOf(mask: HTMLCanvasElement): ImageData {
  return mask.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, mask.width, mask.height);
}

/** Stretches the square answer of the AI back to the shape of the picture. */
function drawAiMask(mask: HTMLCanvasElement, aiMask: ImageData): void {
  const square = document.createElement('canvas');
  square.width = aiMask.width;
  square.height = aiMask.height;
  square.getContext('2d')!.putImageData(aiMask, 0, 0);
  const ctx = mask.getContext('2d', { willReadFrequently: true })!;
  ctx.globalCompositeOperation = 'copy';
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(square, 0, 0, mask.width, mask.height);
  ctx.globalCompositeOperation = 'source-over';
}

function save(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
