/**
 * The AI models the user can choose from, shown on the home page and in the tool. Plain data
 * without imports: scripts/seo.mjs reads it too. Each one is pinned to a commit of its Hugging
 * Face repository and downloaded by the visitor's browser, once, after they agree to it.
 *
 * - `input`: the picture the model reads (see InputShape in engine/mask.ts: a square, or the
 *   picture's own shape)
 * - `mean` / `std`: how the pixels are normalised before the model reads them
 * - `weights`: bytes of each precision its repository offers; fp16 needs a graphics card that
 *   supports it, the processor uses fp32
 *
 * Tried and left out, with ONNX Runtime Web 1.31 (worth trying again when it moves on):
 * - BiRefNet lite: on WebGPU one operation needs 17 storage buffers where graphics cards offer
 *   16 at most, even on a device created with every limit raised; WebAssembly runs out of memory.
 * - BEN2: its LayerNorm shader is refused by WebGPU, and its only weights are fp16.
 * - MODNet (portrait matting, 13–26 MB): runs everywhere and fast, but its mattes are full of
 *   holes even on portraits, and it keeps whole objects around other subjects.
 * - RMBG 1.4 and 2.0: licenses that forbid commercial use of the results.
 */
export const MODELS = {
  isnet: {
    name: 'IS-Net',
    maker: 'Xuebin Qin et al.',
    paper: 'ECCV 2022',
    paperUrl: 'https://arxiv.org/abs/2203.03041',
    license: 'Apache-2.0',
    repo: 'BritishWerewolf/IS-Net',
    revision: '9783722d9f964c0286a411e7e8e6fede947d5a53',
    input: { kind: 'square', size: 1024 },
    mean: [0.5, 0.5, 0.5],
    std: [1, 1, 1],
    weights: { fp32: 178648008 },
    url: 'https://github.com/xuebinqin/DIS',
  },
  ormbg: {
    name: 'ORMBG',
    maker: 'schirrmacher',
    paper: null,
    paperUrl: null,
    license: 'Apache-2.0',
    repo: 'onnx-community/ormbg-ONNX',
    revision: '034e2d884afbab897e10e78fc5bb566b29533fd6',
    input: { kind: 'square', size: 1024 },
    mean: [0, 0, 0],
    std: [1, 1, 1],
    weights: { fp16: 88117930, fp32: 176116019 },
    url: 'https://huggingface.co/schirrmacher/ormbg',
  },
} as const;

export type ModelId = keyof typeof MODELS;
export type ModelInput = (typeof MODELS)[ModelId]['input'];
export type Precision = 'fp16' | 'fp32';
export const MODEL_IDS = Object.keys(MODELS) as ModelId[];

/** The model offered first: the most versatile one. */
export const DEFAULT_MODEL: ModelId = 'isnet';

/** The weights file of a precision, in the repository. */
export const weightsFile = (precision: Precision) => (precision === 'fp16' ? '/onnx/model_fp16.onnx' : '/onnx/model.onnx');

/** Bytes downloaded for a model in a precision (fp32 when it has no fp16). */
export function weightsBytes(id: ModelId, precision: Precision): number {
  const weights: Partial<Record<Precision, number>> = MODELS[id].weights;
  return weights[precision] ?? weights.fp32!;
}

/**
 * SAM 2.1 (Segment Anything 2, Meta): not a background remover, but a click-to-select tool. The
 * picture is read once by its encoder (the heavy part), then each click is answered at once by
 * its decoder with the outline of the object under it. Used by the "Click" retouch tool to add
 * an object the cutout missed, or to take one away. Downloaded once, after the user agrees.
 */
export const SAM = {
  name: 'SAM 2.1',
  maker: 'Meta AI (Ravi et al.)',
  paper: '2024',
  paperUrl: 'https://arxiv.org/abs/2408.00714',
  license: 'Apache-2.0',
  repo: 'onnx-community/sam2.1-hiera-tiny-ONNX',
  revision: '814a066640debee5a91e70aa401fb8e17e030503',
  /** Both of its parts, encoder and decoder, each an .onnx file and its .onnx_data weights. */
  weights: { fp16: 78004244, fp32: 155610424 },
  url: 'https://github.com/facebookresearch/sam2',
} as const;

/** Everything the home page's spec sheets show: the cutout models, then SAM. */
export const AI_SHEETS = { ...MODELS, sam: SAM } as const;
export type SheetId = keyof typeof AI_SHEETS;
export const SHEET_IDS = Object.keys(AI_SHEETS) as SheetId[];
