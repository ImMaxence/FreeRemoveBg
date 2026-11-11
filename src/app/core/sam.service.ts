import { Injectable, computed, signal } from '@angular/core';
import * as Comlink from 'comlink';
import { SAM_INPUT, type SamPoint, samWorkSize } from '../engine/sam';
import type { RemoveProgress, SamWorkerApi } from '../workers/worker-types';
import { SAM } from './models';
import type { Item } from './images.store';

/**
 * Same steps as the cutout model: `missing` until the user agrees to download it, then
 * `downloading`, `preparing` and `ready`. `idle` before the "Click" tool is first opened.
 */
export type SamState = 'idle' | 'checking' | 'missing' | 'downloading' | 'preparing' | 'ready' | 'error';

/**
 * SAM 2.1 for the "Click" tool, in its own worker so the cutout model stays untouched. Nothing
 * is looked at before the tool is opened, nothing is downloaded before the user agrees.
 */
@Injectable({ providedIn: 'root' })
export class SamService {
  readonly state = signal<SamState>('idle');
  readonly download = signal<{ progress: number; loaded?: number; total?: number } | null>(null);
  readonly error = signal<string | null>(null);
  /** Download size on this device (bytes). */
  readonly bytes = signal<number>(SAM.weights.fp32);
  /** The picture is being read by the encoder (the slow part, once per picture). */
  readonly reading = signal(false);
  /** Key of the picture read: clicks can be answered for it. */
  readonly readKey = signal<string | null>(null);
  readonly allowed = computed(() => ['downloading', 'preparing', 'ready'].includes(this.state()));

  private worker?: Worker;
  private remote?: Comlink.Remote<SamWorkerApi>;
  private forceWasm = false;
  private pending: Promise<unknown> = Promise.resolve();
  /** One key per picture bitmap: a turned or cropped picture is another picture. */
  private readonly keys = new WeakMap<ImageBitmap, number>();
  private nextKey = 1;

  private get ai(): Comlink.Remote<SamWorkerApi> {
    if (!this.remote) {
      this.worker = new Worker(new URL('../workers/sam.worker', import.meta.url), { type: 'module', name: 'frb-sam' });
      this.remote = Comlink.wrap<SamWorkerApi>(this.worker);
      void this.remote.configure({ device: this.forceWasm ? 'wasm' : undefined });
    }
    return this.remote;
  }

  /** Keeps SAM on the processor (tests, or after the graphics card failed). */
  configure(options: { device?: 'wasm' }): void {
    this.forceWasm = options.device === 'wasm';
    this.worker?.terminate();
    this.worker = this.remote = undefined;
    this.readKey.set(null);
    if (this.state() === 'ready') this.state.set('preparing');
  }

  /** Looks for SAM in the browser when the tool is opened; already there, it is loaded at once. */
  async check(): Promise<void> {
    if (this.state() !== 'idle') return;
    this.state.set('checking');
    let cached = false;
    try {
      this.bytes.set((await this.ai.target()).bytes);
      cached = await this.ai.isCached();
    } catch {
      // No cache: SAM has to be downloaded.
    }
    if (cached) await this.load();
    else this.state.set('missing');
  }

  /** The user agreed: SAM is downloaded (once), then prepared. */
  async agree(): Promise<void> {
    if (this.allowed()) return;
    this.download.set({ progress: 0 });
    this.state.set('downloading');
    await this.load();
  }

  private async load(): Promise<void> {
    this.error.set(null);
    const onProgress = (p: RemoveProgress) => {
      if (p.stage === 'download') {
        this.state.set('downloading');
        this.download.set({ progress: p.progress, loaded: p.loaded, total: p.total });
      } else if (p.stage === 'load') this.state.set('preparing');
    };
    try {
      try {
        await this.serial(() => this.ai.load(Comlink.proxy(onProgress)));
      } catch (e) {
        if ((await this.ai.target().catch(() => null))?.device !== 'webgpu') throw e;
        console.warn('SAM could not be prepared on WebGPU, switching to WebAssembly', e);
        this.configure({ device: 'wasm' });
        this.bytes.set((await this.ai.target()).bytes);
        await this.serial(() => this.ai.load(Comlink.proxy(onProgress)));
      }
      this.state.set('ready');
      this.download.set(null);
    } catch (e) {
      console.error(e);
      this.state.set('error');
      this.error.set(e instanceof Error ? e.message : String(e));
    }
  }

  /** Key of a picture: its id and its current bitmap. */
  keyOf(item: Item): string {
    let key = this.keys.get(item.source);
    if (!key) this.keys.set(item.source, (key = this.nextKey++));
    return `${item.id}:${key}`;
  }

  /** Size of the copy SAM reads for a picture: clicks are given in its pixels. */
  workSize(item: Item): { width: number; height: number } {
    return samWorkSize(item.width, item.height);
  }

  /** Has SAM read the picture (once per picture), so that clicks are answered at once. */
  async read(item: Item): Promise<void> {
    const key = this.keyOf(item);
    if (this.state() !== 'ready' || this.readKey() === key) return;
    this.reading.set(true);
    this.readKey.set(null);
    try {
      const size = this.workSize(item);
      const copy = await createImageBitmap(item.source, { resizeWidth: size.width, resizeHeight: size.height, resizeQuality: 'high' });
      await this.serial(() => this.ai.embed(key, Comlink.transfer(copy, [copy])));
      this.readKey.set(key);
    } finally {
      this.reading.set(false);
    }
  }

  /** The object under the points and in the box (in pixels of workSize), as opacities of that size. */
  segment(points: SamPoint[], box?: { x: number; y: number; width: number; height: number }): Promise<{ alpha: Uint8ClampedArray<ArrayBuffer>; width: number; height: number }> {
    return this.serial(() => this.ai.segment(points, box));
  }

  /** SAM's input side, for the people who want to know. */
  readonly inputSide = SAM_INPUT;

  /** The encoder's work on the last picture is dropped (the tool was left). */
  forget(): void {
    this.readKey.set(null);
    if (this.remote) void this.serial(() => this.ai.forget());
  }

  private serial<T>(task: () => Promise<T>): Promise<T> {
    const next = this.pending.then(task, task);
    this.pending = next.catch(() => undefined);
    return next;
  }
}
