import type { ModelId, Precision } from '../core/models';
import type { ModelLoadProgress } from './model-progress';

export type AiDevice = 'webgpu' | 'wasm';

/** What the worker is doing: getting the model (once), preparing it, then reading the picture. */
export type RemoveProgress = ModelLoadProgress | { stage: 'run'; progress: 0 };

/** Choices imposed on the worker: the model the user picked, the processor after a failure or in tests. */
export interface WorkerOptions {
  /** 'wasm' keeps the processor even when a graphics card is there. */
  device?: 'wasm';
  model?: ModelId;
}

/** A model, where it runs on this device, in which precision, and how much it downloads there. */
export interface WorkerTarget {
  model: ModelId;
  device: AiDevice;
  dtype: Precision;
  bytes: number;
}

export interface CatalogEntry extends WorkerTarget {
  /** The browser already holds it: choosing it downloads nothing. */
  cached: boolean;
}

export interface RemoveResult {
  /** Opacity of each pixel of the `width` × `height` picture the model read: 255 is the subject. */
  alpha: Uint8ClampedArray<ArrayBuffer>;
  width: number;
  height: number;
  model: ModelId;
  device: AiDevice;
  /** Time spent reading the picture, without the model's download and preparation. */
  ms: number;
}

export interface RemoveWorkerApi {
  /** To call before anything else. */
  configure(options: WorkerOptions): void;
  target(): Promise<WorkerTarget>;
  /** Whether the browser already holds the chosen model's weights: then nothing needs downloading. */
  isCached(): Promise<boolean>;
  /** Every model, as it would run on this device, and whether it is already downloaded. */
  catalog(): Promise<CatalogEntry[]>;
  /**
   * Downloads the chosen model if needed (only once the user agreed to it), then prepares it on
   * the device. `remove` does it too, but then the user has already agreed.
   */
  load(onProgress: (p: RemoveProgress) => void): Promise<WorkerTarget>;
  /** `image`: the picture at the size the model reads (see modelInputSize). */
  remove(image: ImageBitmap, onProgress: (p: RemoveProgress) => void): Promise<RemoveResult>;
}

/** Where SAM runs on this device, in which precision, and how much it downloads there. */
export interface SamTarget {
  device: AiDevice;
  dtype: Precision;
  bytes: number;
}

export interface SamWorkerApi {
  configure(options: { device?: 'wasm' }): void;
  target(): Promise<SamTarget>;
  isCached(): Promise<boolean>;
  /** Downloads SAM if needed (only once the user agreed to it), then prepares it. */
  load(onProgress: (p: RemoveProgress) => void): Promise<SamTarget>;
  /** Reads a picture (at most 1024 px, see samWorkSize): its clicks are answered at once afterwards. */
  embed(key: string, image: ImageBitmap): Promise<void>;
  /** The object under these points (and in this box), as opacities of the picture read by `embed`. */
  segment(
    points: { x: number; y: number; positive: boolean }[],
    box?: { x: number; y: number; width: number; height: number },
  ): Promise<{ alpha: Uint8ClampedArray<ArrayBuffer>; width: number; height: number }>;
  /** Frees what the encoder made of the last picture. */
  forget(): void;
}
