/// <reference lib="webworker" />
/**
 * AI worker: finds the subject of a picture with a segmentation model run by Transformers.js
 * (ONNX Runtime), on the graphics card (WebGPU) when there is one, on the processor
 * (WebAssembly) otherwise. The model is downloaded once from Hugging Face, then served from the
 * browser cache, so it works offline afterwards. Pictures never leave this worker.
 *
 * When the graphics card fails, the page replaces this worker by a new one kept on the
 * processor (see ImagesStore): a failed WebGPU run leaves ONNX Runtime unusable.
 */
import * as Comlink from 'comlink';
import { AutoModel, type PreTrainedModel, Tensor, env } from '@huggingface/transformers';
import { GPU_MODEL, CPU_MODEL, MODELS } from '../core/models';
import { alphaFromScores, pixelsToInput } from '../engine/mask';
import { modelIsCached, modelProgress } from './model-progress';
import type { RemoveProgress, RemoveWorkerApi, WorkerOptions, WorkerTarget } from './worker-types';

env.allowLocalModels = false;
env.useBrowserCache = true;
// ONNX Runtime binaries are self-hosted (no CDN), which also lets the PWA cache them.
if (env.backends.onnx.wasm) {
  env.backends.onnx.wasm.wasmPaths = {
    mjs: `${self.location.origin}/ort/ort-wasm-simd-threaded.asyncify.mjs`,
    wasm: `${self.location.origin}/ort/ort-wasm-simd-threaded.asyncify.wasm`,
  };
}

let options: WorkerOptions = {};
let model: PreTrainedModel | null = null;
let loaded: WorkerTarget | null = null;
/** The choice of model and device, made once. */
let picked: Promise<WorkerTarget> | null = null;

async function pickTarget(): Promise<WorkerTarget> {
  const gpu = (self.navigator as Navigator & { gpu?: { requestAdapter(): Promise<{ features: Set<string> } | null> } }).gpu;
  // Safari on iPhone and iPad stays on the processor: its WebGPU runs out of memory.
  if (gpu && options.device !== 'wasm' && !/iPhone|iPad|iPod/.test(self.navigator.userAgent)) {
    try {
      const adapter = await gpu.requestAdapter();
      const id = options.model ?? GPU_MODEL;
      const dtypes: readonly string[] = MODELS[id].dtypes;
      const dtype = adapter?.features.has('shader-f16') && dtypes.includes('fp16') ? 'fp16' : dtypes.includes('fp32') ? 'fp32' : null;
      if (adapter && dtype) return { model: id, device: 'webgpu', dtype, size: MODELS[id].size };
    } catch {
      // Fall through to WebAssembly.
    }
  }
  const id = options.model ?? CPU_MODEL;
  return { model: id, device: 'wasm', dtype: 'fp32', size: MODELS[id].size };
}

async function load(onProgress: (p: RemoveProgress) => void): Promise<WorkerTarget> {
  const target = await (picked ??= pickTarget());
  if (model && loaded === target) return target;
  // Preparing the model on the graphics card can take many seconds, with no signal from it.
  onProgress({ stage: 'load', progress: 0 });
  const { repo, revision } = MODELS[target.model];
  const fromCache = await modelIsCached(repo, revision, target.dtype === 'fp16' ? '/onnx/model_fp16.onnx' : '/onnx/model.onnx');
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
  const canvas = new OffscreenCanvas(spec.size, spec.size);
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(image, 0, 0, spec.size, spec.size);
  const pixels = ctx.getImageData(0, 0, spec.size, spec.size).data;
  const input = new Tensor('float32', pixelsToInput(pixels, spec.size, spec.mean, spec.std), [1, 3, spec.size, spec.size]);

  const session = (model as unknown as { sessions: Record<string, { inputNames: string[] }> }).sessions['model'];
  const outputs = (await model!({ [session.inputNames[0]]: input })) as Record<string, Tensor>;
  input.dispose();
  // The mask is the output named so, else the last one.
  const names = Object.keys(outputs);
  const output = outputs['output_image'] ?? outputs['output'] ?? outputs[names[names.length - 1]];
  const alpha = alphaFromScores(output.data as Float32Array | Uint16Array, spec.size * spec.size);
  for (const name of names) outputs[name].dispose();
  return alpha;
}

const api: RemoveWorkerApi = {
  configure(next) {
    options = next;
  },

  target() {
    return (picked ??= pickTarget());
  },

  async remove(image, onProgress) {
    try {
      const target = await load(onProgress);
      onProgress({ stage: 'run', progress: 0 });
      const start = performance.now();
      const alpha = await run(image, target);
      const result = { alpha, size: target.size, model: target.model, device: target.device, ms: Math.round(performance.now() - start) };
      return Comlink.transfer(result, [alpha.buffer]);
    } finally {
      image.close();
    }
  },
};

Comlink.expose(api);
