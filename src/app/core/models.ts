/**
 * The AI models that cut the subject out, shown on the home page. Plain data without imports:
 * scripts/seo.mjs reads it too. Each one is pinned to a commit of its Hugging Face repository
 * and downloaded by the visitor's browser, once.
 *
 * - `mean` / `std`: how the pixels are normalised before the model reads them
 * - `dtypes`: the precisions its repository offers (fp16 needs a graphics card that supports it)
 *
 * Tried and left out, with ONNX Runtime Web 1.31: BiRefNet lite (WebGPU refuses one of its
 * operations, WebAssembly runs out of memory) and BEN2 (WebGPU cannot allocate its buffers).
 */
export const MODELS = {
  isnet: {
    name: 'IS-Net',
    maker: 'Xuebin Qin et al.',
    license: 'Apache-2.0',
    repo: 'BritishWerewolf/IS-Net',
    revision: '9783722d9f964c0286a411e7e8e6fede947d5a53',
    size: 1024,
    mean: [0.5, 0.5, 0.5],
    std: [1, 1, 1],
    dtypes: ['fp32'],
    download: '179 MB',
    icon: 'sparkles',
    url: 'https://github.com/xuebinqin/DIS',
  },
} as const;

export type ModelId = keyof typeof MODELS;
export const MODEL_IDS = Object.keys(MODELS) as ModelId[];

/** The model run on a graphics card (WebGPU), and the one run on the processor (WebAssembly). */
export const GPU_MODEL: ModelId = 'isnet';
export const CPU_MODEL: ModelId = 'isnet';
