/// <reference lib="webworker" />
/**
 * SAM worker: the "Click" tool. SAM 2.1 reads the picture once (its encoder, the heavy part),
 * then answers each click at once (its decoder) with the outline of the object under it. The
 * model is downloaded once from Hugging Face, after the user agreed to it; pictures never leave
 * this worker.
 */
import * as Comlink from 'comlink';
import { Sam2Model, Tensor } from '@huggingface/transformers';
import { SAM, weightsFile } from '../core/models';
import { SAM_INPUT, boxToSamInput, chooseMask, samAlpha, toSamInput } from '../engine/sam';
import { halfToFloat, pixelsToInput } from '../engine/mask';
import { modelIsCached, modelProgress } from './model-progress';
import { type DeviceInfo, detectDevice } from './runtime';
import type { SamTarget, SamWorkerApi } from './worker-types';

const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];

let forceWasm = false;
let device: Promise<DeviceInfo> | null = null;
let model: Sam2Model | null = null;
let loading: Promise<SamTarget> | null = null;
/** The picture read last, its size, and what the encoder made of it. */
let embedded: { key: string; width: number; height: number; embeddings: Record<string, Tensor> } | null = null;

async function target(): Promise<SamTarget> {
  device ??= detectDevice(forceWasm);
  const { gpu, fp16 } = await device;
  const dtype = gpu && fp16 ? 'fp16' : 'fp32';
  return { device: gpu ? 'webgpu' : 'wasm', dtype, bytes: SAM.weights[dtype] };
}

/** The encoder's weights are the large part: when they are in the cache, so is the rest. */
async function cached(t: SamTarget): Promise<boolean> {
  return modelIsCached(SAM.repo, SAM.revision, weightsFile(t.dtype).replace('model', 'vision_encoder') + '_data');
}

/** A half-precision model may answer in 16-bit floats. */
function floats(data: unknown): ArrayLike<number> {
  return data instanceof Uint16Array ? Float32Array.from(data, halfToFloat) : (data as Float32Array);
}

function release(): void {
  if (!embedded) return;
  for (const tensor of Object.values(embedded.embeddings)) tensor.dispose();
  embedded = null;
}

const api: SamWorkerApi = {
  configure(options) {
    forceWasm = options.device === 'wasm';
    device = null;
  },

  target,

  async isCached() {
    return cached(await target());
  },

  load(onProgress) {
    loading ??= (async () => {
      const t = await target();
      if (model) return t;
      onProgress({ stage: 'load', progress: 0 });
      const fromCache = await cached(t);
      model = (await Sam2Model.from_pretrained(SAM.repo, {
        revision: SAM.revision,
        device: t.device,
        dtype: t.dtype,
        // Each part's weights are in one .onnx_data file next to it.
        use_external_data_format: 1,
        progress_callback: modelProgress(onProgress, fromCache) as never,
      })) as Sam2Model;
      return t;
    })().finally(() => (loading = null));
    return loading;
  },

  async embed(key, image) {
    try {
      if (embedded?.key === key) return;
      release();
      const canvas = new OffscreenCanvas(SAM_INPUT, SAM_INPUT);
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
      ctx.drawImage(image, 0, 0, SAM_INPUT, SAM_INPUT);
      const pixels = ctx.getImageData(0, 0, SAM_INPUT, SAM_INPUT).data;
      const pixel_values = new Tensor('float32', pixelsToInput(pixels, SAM_INPUT * SAM_INPUT, MEAN, STD), [1, 3, SAM_INPUT, SAM_INPUT]);
      const embeddings = (await model!.get_image_embeddings({ pixel_values })) as Record<string, Tensor>;
      pixel_values.dispose();
      embedded = { key, width: image.width, height: image.height, embeddings };
    } finally {
      image.close();
    }
  },

  async segment(points, box) {
    if (!embedded || !model || (!points.length && !box)) throw new Error('Nothing to segment');
    const { width, height, embeddings } = embedded;
    const inputs: Record<string, Tensor> = {};
    if (points.length) {
      inputs['input_points'] = new Tensor('float32', Float32Array.from(points.flatMap((p) => toSamInput(p, width, height))), [1, 1, points.length, 2]);
      inputs['input_labels'] = new Tensor('int64', BigInt64Array.from(points.map((p) => (p.positive ? 1n : 0n))), [1, 1, points.length]);
    }
    if (box) inputs['input_boxes'] = new Tensor('float32', Float32Array.from(boxToSamInput(box, width, height)), [1, 1, 4]);
    const outputs = (await model({ ...embeddings, ...inputs })) as { pred_masks: Tensor; iou_scores: Tensor };
    for (const tensor of Object.values(inputs)) tensor.dispose();
    const masks = outputs.pred_masks;
    const low = masks.dims[masks.dims.length - 1];
    const scores = floats(outputs.iou_scores.data);
    const data = floats(masks.data);
    // A lone click is ambiguous: the whole object is preferred to one of its parts.
    const best = chooseMask(scores, data, low, points.length === 1 && !box && points[0].positive);
    const alpha = samAlpha(data, best * low * low, low, width, height);
    masks.dispose();
    outputs.iou_scores.dispose();
    return Comlink.transfer({ alpha, width, height }, [alpha.buffer]);
  },

  forget() {
    release();
  },
};

Comlink.expose(api);
