import type { ModelId } from '../core/models';
import type { ModelLoadProgress } from './model-progress';

export type AiDevice = 'webgpu' | 'wasm';

/** What the worker is doing: getting the model (once), preparing it, then reading the picture. */
export type RemoveProgress = ModelLoadProgress | { stage: 'run'; progress: 0 };

/** Choices imposed on the worker instead of its own: after a failure, or by tests. */
export interface WorkerOptions {
  /** 'wasm' keeps the processor even when a graphics card is there. */
  device?: 'wasm';
  model?: ModelId;
}

/** The model the worker runs, where, and the side of the square picture it reads. */
export interface WorkerTarget {
  model: ModelId;
  device: AiDevice;
  dtype: 'fp16' | 'fp32';
  size: number;
}

export interface RemoveResult {
  /** Opacity of each pixel of the `size` × `size` picture the model read: 255 is the subject. */
  alpha: Uint8ClampedArray<ArrayBuffer>;
  size: number;
  model: ModelId;
  device: AiDevice;
  /** Time spent reading the picture, without the model's download and preparation. */
  ms: number;
}

export interface RemoveWorkerApi {
  /** To call before anything else. */
  configure(options: WorkerOptions): void;
  target(): Promise<WorkerTarget>;
  /** Whether the browser already holds the model's weights: then nothing needs downloading. */
  isCached(): Promise<boolean>;
  /**
   * Downloads the model if needed (only once the user agreed to it), then prepares it on the
   * device. `remove` does it too, but then the user has already agreed.
   */
  load(onProgress: (p: RemoveProgress) => void): Promise<WorkerTarget>;
  /** `image`: the picture stretched to the square size of the target. */
  remove(image: ImageBitmap, onProgress: (p: RemoveProgress) => void): Promise<RemoveResult>;
}
