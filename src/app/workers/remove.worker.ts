/// <reference lib="webworker" />
/**
 * AI worker: finds the subject of a picture with a segmentation model run by Transformers.js
 * (ONNX Runtime), on the graphics card (WebGPU) when there is one, on the processor
 * (WebAssembly) otherwise. The model is downloaded once from Hugging Face, after the user
 * agreed to it, then served from the browser cache, so it works offline afterwards. Pictures
 * never leave this worker.
 *
 * When the graphics card fails, the page replaces this worker by a new one kept on the
 * processor (see ImagesStore): a failed WebGPU run leaves ONNX Runtime unusable.
 */
import * as Comlink from 'comlink';
import { AutoModel, type PreTrainedModel, Tensor } from '@huggingface/transformers';
import { DEFAULT_MODEL, MODELS, MODEL_IDS, type ModelId, type Precision, weightsBytes, weightsFile } from '../core/models';
import { alphaFromScores, pixelsToInput } from '../engine/mask';
import { modelIsCached, modelProgress } from './model-progress';
import { type DeviceInfo, detectDevice as checkDevice } from './runtime';
import type { RemoveProgress, RemoveWorkerApi, WorkerOptions, WorkerTarget } from './worker-types';

let options: WorkerOptions = {};
let model: PreTrainedModel | null = null;
let loaded: WorkerTarget | null = null;

/** What this device offers, checked once (and again after a change of options). */
let device: Promise<DeviceInfo> | null = null;

function detectDevice(): Promise<DeviceInfo> {
  device ??= checkDevice(options.device === 'wasm');
  return device;
}

/** Where and in which precision a model runs on this device. */
async function targetFor(id: ModelId): Promise<WorkerTarget> {
  const { gpu, fp16 } = await detectDevice();
  const weights: Partial<Record<Precision, number>> = MODELS[id].weights;
  const dtype: Precision = gpu && fp16 && weights.fp16 ? 'fp16' : 'fp32';
  return { model: id, device: gpu ? 'webgpu' : 'wasm', dtype, bytes: weightsBytes(id, dtype) };
}

const current = () => targetFor(options.model ?? DEFAULT_MODEL);

const weightsCached = (target: WorkerTarget) => modelIsCached(MODELS[target.model].repo, MODELS[target.model].revision, weightsFile(target.dtype));

/** The model being fetched and prepared: asked twice at once, it is still loaded once. */
let loading: Promise<WorkerTarget> | null = null;
/** Everyone waiting for the model hears its progress. */
const listeners = new Set<(p: RemoveProgress) => void>();

function load(onProgress: (p: RemoveProgress) => void): Promise<WorkerTarget> {
  listeners.add(onProgress);
  loading ??= prepare((p) => listeners.forEach((listener) => listener(p))).finally(() => {
    loading = null;
    listeners.clear();
  });
  return loading;
}

async function prepare(onProgress: (p: RemoveProgress) => void): Promise<WorkerTarget> {
  const target = await current();
  if (model && loaded?.model === target.model && loaded.dtype === target.dtype && loaded.device === target.device) return loaded;
  await model?.dispose().catch(() => undefined);
  model = null;
  loaded = null;
  // Preparing the model on the graphics card can take many seconds, with no signal from it.
  onProgress({ stage: 'load', progress: 0 });
  const { repo, revision } = MODELS[target.model];
  const fromCache = await weightsCached(target);
  model = await AutoModel.from_pretrained(repo, {
    revision,
    device: target.device,
    dtype: target.dtype,
    progress_callback: modelProgress(onProgress, fromCache) as never,
  });
  loaded = target;
  return target;
}

async function run(image: ImageBitmap, target: WorkerTarget): Promise<Uint8ClampedArray<ArrayBuffer>> {
  const spec = MODELS[target.model];
  const { width, height } = image;
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(image, 0, 0);
  const pixels = ctx.getImageData(0, 0, width, height).data;
  const input = new Tensor('float32', pixelsToInput(pixels, width * height, spec.mean, spec.std), [1, 3, height, width]);

  const session = (model as unknown as { sessions: Record<string, { inputNames: string[] }> }).sessions['model'];
  const outputs = (await model!({ [session.inputNames[0]]: input })) as Record<string, Tensor>;
  input.dispose();
  // The mask is the output named so, else the last one.
  const names = Object.keys(outputs);
  const output = outputs['output_image'] ?? outputs['output'] ?? outputs[names[names.length - 1]];
  const alpha = alphaFromScores(output.data as Float32Array | Uint16Array, width * height);
  for (const name of names) outputs[name].dispose();
  return alpha;
}

const api: RemoveWorkerApi = {
  configure(next) {
    options = next;
    device = null;
  },

  target() {
    return current();
  },

  async isCached() {
    return weightsCached(await current());
  },

  async catalog() {
    return Promise.all(
      MODEL_IDS.map(async (id) => {
        const target = await targetFor(id);
        return { ...target, cached: await weightsCached(target).catch(() => false) };
      }),
    );
  },

  async load(onProgress) {
    return load(onProgress);
  },

  async remove(image, onProgress) {
    try {
      const target = await load(onProgress);
      onProgress({ stage: 'run', progress: 0 });
      const start = performance.now();
      const alpha = await run(image, target);
      const result = { alpha, width: image.width, height: image.height, model: target.model, device: target.device, ms: Math.round(performance.now() - start) };
      return Comlink.transfer(result, [alpha.buffer]);
    } finally {
      image.close();
    }
  },
};

Comlink.expose(api);
