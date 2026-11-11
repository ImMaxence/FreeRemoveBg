/// <reference lib="webworker" />
/**
 * What the AI workers share: ONNX Runtime served by this site (no CDN), and the check of the
 * graphics card. Imported by the workers only.
 */
import { env } from '@huggingface/transformers';

env.allowLocalModels = false;
env.useBrowserCache = true;
// ONNX Runtime binaries are self-hosted (no CDN), which also lets the PWA cache them.
if (env.backends.onnx.wasm) {
  env.backends.onnx.wasm.wasmPaths = {
    mjs: `${self.location.origin}/ort/ort-wasm-simd-threaded.asyncify.mjs`,
    wasm: `${self.location.origin}/ort/ort-wasm-simd-threaded.asyncify.wasm`,
  };
}

export interface DeviceInfo {
  /** WebGPU is there and gives an adapter. */
  gpu: boolean;
  /** The graphics card computes in half precision (smaller downloads). */
  fp16: boolean;
}

/**
 * The graphics card, if the browser offers one. Safari on iPhone and iPad stays on the
 * processor: its WebGPU runs out of memory with these models.
 */
export async function detectDevice(forceWasm: boolean): Promise<DeviceInfo> {
  const gpu = (self.navigator as Navigator & { gpu?: { requestAdapter(): Promise<{ features: Set<string> } | null> } }).gpu;
  if (!gpu || forceWasm || /iPhone|iPad|iPod/.test(self.navigator.userAgent)) return { gpu: false, fp16: false };
  try {
    const adapter = await gpu.requestAdapter();
    return { gpu: !!adapter, fp16: !!adapter?.features.has('shader-f16') };
  } catch {
    return { gpu: false, fp16: false };
  }
}
